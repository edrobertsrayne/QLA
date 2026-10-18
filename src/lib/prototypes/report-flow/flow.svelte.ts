/* eslint-disable svelte/prefer-svelte-reactivity -- PROTOTYPE: local maps, stub timestamps */
// PROTOTYPE — throwaway state for the report generation, editing and print flow (wayfinder #54).
//
// Reads the real marksheet store (students, entries, marks, absent flags) and keeps
// everything Phase 3 would add in memory: topic names, reports, the run. The model
// calls are stubs: delays and failures are faked so the flow can be judged without
// spending a token. Reloading the page forgets every report, by design (no persistence).

import {
	isOverMax,
	type BreakdownEntry,
	type MarksheetDocument,
	type StoredStudent
} from '$lib/marksheet/document.js';
import { facilityBand, type RagBand } from '$lib/marksheet/analysis.js';
import { studentName } from '$lib/marksheet/students.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { tick } from 'svelte';

/** Calls in flight at once, per the cost research. */
export const CONCURRENCY = 5;

export type Blocker =
	| { kind: 'absent' }
	| { kind: 'part-marked'; missing: BreakdownEntry[] }
	| { kind: 'over-max'; entries: BreakdownEntry[] };

export function blockerText(blocker: Blocker): string {
	switch (blocker.kind) {
		case 'absent':
			return 'Absent';
		case 'part-marked':
			return `${blocker.missing.length} unmarked (${blocker.missing
				.slice(0, 4)
				.map((e) => e.label)
				.join(', ')}${blocker.missing.length > 4 ? '…' : ''})`;
		case 'over-max':
			return `Mark over max on ${blocker.entries.map((e) => e.label).join(', ')}`;
	}
}

export interface RollupRow {
	key: string;
	name: string;
	gained: number;
	available: number;
	share: number;
	band: RagBand;
}

export interface Prose {
	wentWell: string[];
	evenBetterIf: { topic: string; text: string }[];
}

export type ReportStatus = 'queued' | 'generating' | 'done' | 'failed';

export interface ReportState {
	status: ReportStatus;
	generated: Prose | null;
	edited: Prose | null;
	error: string | null;
	generatedAt: Date | null;
	/** Stand-in for "the generation input has changed" — set from the stub panel (behaviour is #56's). */
	stale: boolean;
}

/** Stub knobs, driven from the prototype's stub panel. */
export const stub = $state({
	/** Share of students whose call fails after its retries. */
	failureRate: 0.15,
	/** Multiplier on the fake call latency. */
	speed: 1,
	/** The next run stops at once on a rejected key (401). */
	rejectKey: false,
	/** The topic-name proposal call fails. */
	proposalFails: false
});

export function normaliseCodes(specPoint: string | null): string[] {
	if (specPoint === null) return [];
	return specPoint
		.split(/[,/]/)
		.map((code) => code.trim())
		.filter((code) => code !== '');
}

export interface StudentRow {
	student: StoredStudent;
	name: string;
	blockers: Blocker[];
	eligible: boolean;
	total: number;
	available: number;
}

function delay(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

class ReportFlow {
	store = marksheetStore();
	topicNames = $state<Record<string, string>>({});
	proposal = $state<'idle' | 'running' | 'failed'>('idle');
	reports = $state<Record<string, ReportState>>({});
	run = $state<{ state: 'idle' | 'running' | 'stopped'; message: string | null; total: number }>({
		state: 'idle',
		message: null,
		total: 0
	});
	/** Student ids the print root lays out, or null when not printing. */
	printing = $state<string[] | null>(null);
	#cancel = false;

	document = $derived(this.store.document as MarksheetDocument);
	entries = $derived(this.store.entries);
	available = $derived(this.entries.reduce((sum, e) => sum + (e.marks ?? 0), 0));

	/** Every normalised code on the paper, in paper order. */
	codes = $derived.by(() => {
		const seen: string[] = [];
		for (const entry of this.entries)
			for (const code of normaliseCodes(entry.specPoint)) if (!seen.includes(code)) seen.push(code);
		return seen;
	});

	missingNames = $derived(this.codes.filter((code) => !(this.topicNames[code] ?? '').trim()));

	rows = $derived.by((): StudentRow[] =>
		this.store.students.map((student) => {
			const marks = this.document.marks[student.id] ?? {};
			const blockers: Blocker[] = [];
			if (student.absent) blockers.push({ kind: 'absent' });
			else {
				const missing = this.entries.filter((e) => marks[e.id] === undefined);
				if (missing.length > 0) blockers.push({ kind: 'part-marked', missing });
				const over = this.entries.filter(
					(e) => marks[e.id] !== undefined && isOverMax(marks[e.id], e)
				);
				if (over.length > 0) blockers.push({ kind: 'over-max', entries: over });
			}
			const total = this.entries.reduce((sum, e) => sum + (marks[e.id] ?? 0), 0);
			return {
				student,
				name: studentName(student),
				blockers,
				eligible: blockers.length === 0,
				total,
				available: this.available
			};
		})
	);

	eligible = $derived(this.rows.filter((row) => row.eligible));
	blocked = $derived(this.rows.filter((row) => !row.eligible));
	done = $derived(this.rows.filter((row) => this.reports[row.student.id]?.status === 'done'));
	failed = $derived(this.rows.filter((row) => this.reports[row.student.id]?.status === 'failed'));
	inFlight = $derived(
		this.rows.filter((row) =>
			['queued', 'generating'].includes(this.reports[row.student.id]?.status ?? '')
		)
	);
	/** Eligible students with no report attempted yet: what "Write reports" would do (failed ones are retried). */
	toGenerate = $derived(this.eligible.filter((row) => !this.reports[row.student.id]));
	canGenerate = $derived(this.missingNames.length === 0 && this.run.state !== 'running');

	rollup(studentId: string): { topics: RollupRow[]; aos: RollupRow[] } {
		const marks = this.document.marks[studentId] ?? {};
		const topics = new Map<string, { gained: number; available: number }>();
		const aos = new Map<string, { gained: number; available: number }>();
		const add = (map: typeof topics, key: string, gained: number, available: number) => {
			const row = map.get(key) ?? { gained: 0, available: 0 };
			row.gained += gained;
			row.available += available;
			map.set(key, row);
		};
		for (const entry of this.entries) {
			const gained = marks[entry.id] ?? 0;
			const available = entry.marks ?? 0;
			for (const code of normaliseCodes(entry.specPoint)) add(topics, code, gained, available);
			if (entry.ao) add(aos, entry.ao, gained, available);
		}
		const toRows = (map: typeof topics, name: (key: string) => string) =>
			[...map].map(([key, v]) => {
				const share = v.available === 0 ? 0 : v.gained / v.available;
				return { key, name: name(key), ...v, share, band: facilityBand(share) };
			});
		return {
			topics: toRows(topics, (code) => this.topicNames[code]?.trim() || code),
			aos: toRows(aos, (ao) => ao)
		};
	}

	prose(studentId: string): Prose | null {
		const report = this.reports[studentId];
		return report?.edited ?? report?.generated ?? null;
	}

	/** Stub topic-name proposal: fills only codes with no name or a blank one. */
	async proposeMissingNames(): Promise<void> {
		if (this.missingNames.length === 0 || this.proposal === 'running') return;
		this.proposal = 'running';
		await delay(1200 * stub.speed);
		if (stub.proposalFails) {
			this.proposal = 'failed';
			return;
		}
		for (const code of this.missingNames) {
			const entry = this.entries.find((e) => normaliseCodes(e.specPoint).includes(code));
			const words = (entry?.summary ?? code).split(' ').slice(1, 5).join(' ');
			this.topicNames[code] = words.charAt(0).toUpperCase() + words.slice(1);
		}
		this.proposal = 'idle';
	}

	setTopicName(code: string, name: string): void {
		this.topicNames[code] = name;
	}

	#stubProse(studentId: string): Prose {
		const { topics, aos } = this.rollup(studentId);
		const pool = topics.length > 0 ? topics : aos;
		const sorted = [...pool].sort((a, b) => a.share - b.share);
		const strongest = sorted.slice(-2).reverse();
		const weakest = sorted.slice(0, 3);
		return {
			wentWell: strongest
				.slice(0, strongest[1] && strongest[1].share >= 0.7 ? 2 : 1)
				.map(
					(row) =>
						`You were confident on ${row.name.toLowerCase()}, picking up ${row.gained} of ${row.available} marks — your working was clear and you used the right terms.`
				),
			evenBetterIf: weakest.map((row) => ({
				topic: row.name,
				text: `You gained ${row.gained} of ${row.available} marks on ${row.name.toLowerCase()}. Revise this topic with your notes, then try the exam questions again and check each step against the mark scheme.`
			}))
		};
	}

	async #generateOne(studentId: string): Promise<void> {
		this.reports[studentId] = {
			...(this.reports[studentId] ?? {
				generated: null,
				edited: null,
				generatedAt: null,
				stale: false
			}),
			status: 'generating',
			error: null
		};
		await delay((1500 + Math.random() * 2500) * stub.speed);
		if (this.#cancel) {
			this.reports[studentId].status = this.reports[studentId].generated ? 'done' : 'failed';
			this.reports[studentId].error = this.reports[studentId].generated
				? null
				: 'Stopped before it ran';
			return;
		}
		if (Math.random() < stub.failureRate) {
			this.reports[studentId].status = 'failed';
			this.reports[studentId].error =
				Math.random() < 0.5
					? 'The model returned no usable feedback after 3 attempts'
					: 'OpenRouter was unavailable (503) after 3 attempts';
			return;
		}
		Object.assign(this.reports[studentId], {
			status: 'done',
			generated: this.#stubProse(studentId),
			edited: null,
			generatedAt: new Date(),
			stale: false
		});
	}

	/** Run the given students through the stub call, CONCURRENCY at a time. */
	async generate(studentIds: string[]): Promise<void> {
		if (!this.canGenerate || studentIds.length === 0) return;
		this.#cancel = false;
		this.run = { state: 'running', message: null, total: studentIds.length };
		for (const id of studentIds) {
			this.reports[id] = {
				...(this.reports[id] ?? { generated: null, edited: null, generatedAt: null, stale: false }),
				status: 'queued',
				error: null
			};
		}
		if (stub.rejectKey) {
			await delay(800 * stub.speed);
			for (const id of studentIds) {
				this.reports[id].status = this.reports[id].generated ? 'done' : 'failed';
				this.reports[id].error = this.reports[id].generated
					? null
					: 'Not run: the API key was rejected';
			}
			this.run = {
				state: 'stopped',
				message: 'The run stopped: OpenRouter rejected the API key (401).',
				total: 0
			};
			return;
		}
		const queue = [...studentIds];
		const worker = async () => {
			while (queue.length > 0) {
				const id = queue.shift()!;
				if (this.#cancel) {
					this.reports[id].status = this.reports[id].generated ? 'done' : 'failed';
					this.reports[id].error = this.reports[id].generated ? null : 'Stopped before it ran';
					continue;
				}
				await this.#generateOne(id);
			}
		};
		await Promise.all(Array.from({ length: CONCURRENCY }, worker));
		this.run = {
			state: this.#cancel ? 'stopped' : 'idle',
			message: this.#cancel ? 'Stopped. Reports already written are kept.' : null,
			total: 0
		};
	}

	stop(): void {
		this.#cancel = true;
	}

	generateAll(): Promise<void> {
		return this.generate(this.toGenerate.map((row) => row.student.id));
	}

	retryFailed(): Promise<void> {
		return this.generate(this.failed.map((row) => row.student.id));
	}

	regenerate(studentId: string): Promise<void> {
		return this.generate([studentId]);
	}

	/** Write one field of the teacher's edit, starting the edit from the generated prose. */
	edit(studentId: string, change: (prose: Prose) => void): void {
		const report = this.reports[studentId];
		if (!report?.generated) return;
		if (!report.edited) report.edited = structuredClone($state.snapshot(report.generated));
		change(report.edited);
	}

	revert(studentId: string): void {
		const report = this.reports[studentId];
		if (report) report.edited = null;
	}

	/** Stub for #56: pretend a few reports' generation input changed. */
	markSomeStale(): void {
		for (const row of this.done.slice(0, 3)) this.reports[row.student.id].stale = true;
	}

	reset(): void {
		this.#cancel = true;
		this.reports = {};
		this.topicNames = {};
		this.proposal = 'idle';
		this.run = { state: 'idle', message: null, total: 0 };
	}

	async print(studentIds: string[]): Promise<void> {
		if (studentIds.length === 0) return;
		this.printing = studentIds;
		await tick();
		window.print();
		this.printing = null;
	}

	printAll(): Promise<void> {
		return this.print(this.done.map((row) => row.student.id));
	}
}

let flow: ReportFlow | null = null;

/** The one prototype flow, kept across variant switches (not across reloads). */
export function reportFlow(): ReportFlow {
	flow ??= new ReportFlow();
	return flow;
}

export type { ReportFlow };
