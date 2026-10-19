// PROTOTYPE (throwaway) — "Prototype: feedback prompt against real marks" (#49).
//
// Reads a marksheet backup, selects each student's strengths and areas for improvement locally
// (rules from "Feedback content and quality", #48), sends one OpenRouter call per student per
// model with a strict json_schema, runs the local checks, and writes a review file to read.
//
//   pnpm proto:feedback [--sample PATH] [--models a,b] [--students 01,05|all] [--fixture spec]
//
// `--fixture spec` overlays hand-assigned H556 specification points, AOs and command words on the
// real 13OA marks so the topic path is exercised (synthetic; the real sample has none).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { facilityBand, type RagBand } from '../../marksheet/analysis.js';
import { parseStoredDocument, type StoredStudent } from '../../marksheet/document.js';
import {
	outputSchema,
	PROMPT_VERSION,
	SYSTEM_PROMPT,
	type PayloadItem,
	type StudentPayload
} from './prompt.js';

const args = Object.fromEntries(
	process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => {
		if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
		return acc;
	}, [])
);
const SAMPLE = args.sample ?? '.scratch/qla-backup-thermal-physics-2026-10-19.json';
const MODELS = (
	args.models ?? 'google/gemini-2.5-flash,anthropic/claude-haiku-5.5,openai/gpt-6-luna'
).split(',');
const CAP = 5;
const MAX_ATTEMPTS = 3;
const BOUNDARIES: [string, number][] = [
	['A*', 24],
	['A', 21],
	['B', 18],
	['C', 15],
	['D', 12],
	['E', 9]
];
const BELOW = 'U';

interface Entry {
	id: string;
	label: string;
	questionNumber: string;
	marks: number;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
	ao: string | null;
}

const doc = parseStoredDocument(readFileSync(SAMPLE, 'utf8'));
if (!doc) throw new Error(`${SAMPLE} is not a readable marksheet backup`);
const entries: Entry[] = doc.breakdown.entries.map((e) => ({ ...e, marks: e.marks ?? 0 }));

// Synthetic H556 overlay for the topic path: [specPoint, ao, commandWord] by label.
const SPEC_FIXTURE: Record<string, [string | null, string, string | null]> = {
	'1': ['5.1.4', 'AO2', 'Calculate'],
	'2': ['5.1.3', 'AO2', 'Calculate'],
	'3': ['5.1.4', 'AO1', null],
	'4': ['5.1.4', 'AO1', null],
	'5': ['5.1.1', 'AO2', null],
	'6': ['5.1.2, 5.1.3', 'AO1', null],
	'7': ['5.1.4', 'AO1', null],
	'8a': ['5.1.3', 'AO2', 'Explain'],
	'8b': ['5.1.3', 'AO2', 'Show'],
	'8c': ['5.1.4', 'AO2', 'Calculate'],
	'9a': [null, 'AO2', 'Complete'],
	'9b': [null, 'AO3', 'Plot'],
	'9c': [null, 'AO3', 'Describe'],
	'10ai': ['5.1.2', 'AO1', 'Define'],
	'10aii': ['5.1.2/5.1.4', 'AO2', 'Show'],
	'10bi': ['5.1.4', 'AO2', 'Show'],
	'10bii': ['5.1.4', 'AO2', 'Calculate']
};
const TOPIC_NAMES: Record<string, string> = {
	'5.1.1': 'Temperature and the Kelvin scale',
	'5.1.2': 'Solids, liquids, gases and internal energy',
	'5.1.3': 'Specific heat capacity and latent heat',
	'5.1.4': 'Ideal gases and kinetic theory'
};
if (args.fixture === 'spec') {
	for (const e of entries) [e.specPoint, e.ao, e.commandWord] = SPEC_FIXTURE[e.label];
}

const codes = (sp: string | null) =>
	sp
		? [
				...new Set(
					sp
						.split(/[,/]/)
						.map((s) => s.trim())
						.filter(Boolean)
				)
			]
		: [];

interface Candidate {
	key: string;
	kind: 'topic' | 'question';
	name: string;
	entries: Entry[];
	order: number;
	gained: number;
	available: number;
	share: number;
	dropped: number;
	band: RagBand;
}

function candidates(marks: Record<string, number>): Candidate[] {
	const topics = new Map<string, Entry[]>();
	const pool: Omit<Candidate, 'gained' | 'available' | 'share' | 'dropped' | 'band'>[] = [];
	entries.forEach((e, i) => {
		const cs = codes(e.specPoint);
		if (!cs.length)
			pool.push({ key: e.id, kind: 'question', name: e.summary, entries: [e], order: i });
		for (const c of cs) {
			if (!topics.has(c)) {
				topics.set(c, []);
				pool.push({
					key: c,
					kind: 'topic',
					name: TOPIC_NAMES[c] ?? c,
					entries: topics.get(c)!,
					order: i
				});
			}
			topics.get(c)!.push(e);
		}
	});
	return pool.map((c) => {
		const gained = c.entries.reduce((s, e) => s + marks[e.id], 0);
		const available = c.entries.reduce((s, e) => s + e.marks, 0);
		const share = gained / available;
		return {
			...c,
			gained,
			available,
			share,
			dropped: available - gained,
			band: facilityBand(share)
		};
	});
}

function select(marks: Record<string, number>) {
	const pool = candidates(marks);
	const areas = pool
		.filter((c) => c.dropped >= 1)
		.sort((a, b) => b.dropped - a.dropped || a.share - b.share || a.order - b.order)
		.slice(0, 2);
	const rest = pool.filter((c) => !areas.includes(c));
	const rank = (a: Candidate, b: Candidate) =>
		b.share - a.share || b.available - a.available || a.order - b.order;
	const strengths = [
		...rest.filter((c) => c.band === 'green').sort(rank),
		...rest.filter((c) => c.band === 'amber').sort(rank)
	].slice(0, 3);
	const byOrder = (a: Candidate, b: Candidate) => a.order - b.order;
	return { strengths: strengths.sort(byOrder), areas: areas.sort(byOrder) };
}

function toItem(c: Candidate, ref: string, marks: Record<string, number>): PayloadItem {
	return {
		ref,
		name: c.name,
		kind: c.kind,
		questions: c.entries.map((e) => ({
			label: e.label,
			summary: e.summary,
			commandWord: e.commandWord,
			ao: e.ao,
			gained: marks[e.id],
			available: e.marks
		})),
		gained: c.gained,
		available: c.available
	};
}

// --- local checks (#48): refs once in the right section; no digits but handed question labels ---
const paperLabels = new Set(entries.map((e) => e.label.toLowerCase()));

interface Prose {
	ref: string;
	text: string;
}
interface Feedback {
	strengths: Prose[];
	areasForImprovement: Prose[];
}

const isProseList = (v: unknown): v is Prose[] =>
	Array.isArray(v) &&
	v.every(
		(x) =>
			x &&
			typeof x === 'object' &&
			'ref' in x &&
			'text' in x &&
			typeof x.ref === 'string' &&
			typeof x.text === 'string'
	);

function isFeedback(v: unknown): v is Feedback {
	return (
		!!v &&
		typeof v === 'object' &&
		'strengths' in v &&
		'areasForImprovement' in v &&
		isProseList(v.strengths) &&
		isProseList(v.areasForImprovement)
	);
}

function check(payload: StudentPayload, o: Feedback): string[] {
	const problems: string[] = [];
	for (const [section, items] of [
		['strengths', payload.strengths],
		['areasForImprovement', payload.areasForImprovement]
	] as const) {
		const got = (o[section] ?? []).map((x) => x.ref);
		const want = items.map((i) => i.ref);
		if (got.length !== want.length || want.some((r) => got.filter((g) => g === r).length !== 1))
			problems.push(`${section}: refs ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
		const handed = new Set(
			[...payload.strengths, ...payload.areasForImprovement].flatMap((i) =>
				i.questions.map((q) => q.label.toLowerCase())
			)
		);
		for (const x of o[section] ?? []) {
			// A question label is only allowed as "Q8c" / "Question 8c"; every other digit is a figure.
			const rest = x.text.replace(
				/\b(?:Q|Questions?\s+)(\d+[a-z]*)\b/gi,
				(whole, label: string) => {
					if (!paperLabels.has(label.toLowerCase()))
						problems.push(`${x.ref}: unknown label "${whole}"`);
					else if (!handed.has(label.toLowerCase()))
						problems.push(`${x.ref}: label "${whole}" not handed`);
					return '';
				}
			);
			for (const m of rest.matchAll(/\S*\d\S*/g)) problems.push(`${x.ref}: figure "${m[0]}"`);
		}
	}
	return problems;
}

// --- transport ---
interface Attempt {
	ok: boolean;
	problems: string[];
	ms: number;
	cost?: number;
	tokens?: string;
	raw?: string;
	feedback?: Feedback;
}

async function call(
	model: string,
	payload: StudentPayload
): Promise<{ out?: Feedback; attempts: Attempt[] }> {
	const attempts: Attempt[] = [];
	for (let n = 0; n < MAX_ATTEMPTS; n++) {
		const t0 = performance.now();
		try {
			const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model,
					messages: [
						{ role: 'system', content: SYSTEM_PROMPT },
						{ role: 'user', content: JSON.stringify(payload, null, 2) }
					],
					response_format: { type: 'json_schema', json_schema: outputSchema(payload) },
					provider: { require_parameters: true },
					max_tokens: 4000,
					usage: { include: true },
					stream: false
				}),
				signal: AbortSignal.timeout(60_000)
			});
			const body = await res.json();
			const ms = Math.round(performance.now() - t0);
			if (!res.ok) {
				attempts.push({
					ok: false,
					problems: [`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`],
					ms
				});
				if (res.status < 500 && res.status !== 429 && res.status !== 408) break;
				await Bun.sleep(1000 * 2 ** n);
				continue;
			}
			const u = body.usage ?? {};
			const raw = body.choices?.[0]?.message?.content ?? '';
			const base = {
				ms,
				cost: u.cost,
				tokens: `${u.prompt_tokens}/${u.completion_tokens}${u.completion_tokens_details?.reasoning_tokens ? ` (${u.completion_tokens_details.reasoning_tokens} reasoning)` : ''}`,
				raw
			};
			let out: unknown;
			try {
				out = JSON.parse(raw);
			} catch {
				attempts.push({
					...base,
					ok: false,
					problems: [`unparseable (finish ${body.choices?.[0]?.finish_reason})`]
				});
				continue;
			}
			if (!isFeedback(out)) {
				attempts.push({ ...base, ok: false, problems: ['wrong shape'] });
				continue;
			}
			const problems = check(payload, out);
			attempts.push({ ...base, ok: !problems.length, problems, feedback: out });
			if (!problems.length) return { out, attempts };
		} catch (e) {
			attempts.push({ ok: false, problems: [String(e)], ms: Math.round(performance.now() - t0) });
		}
	}
	return { attempts };
}

async function pool<T>(jobs: (() => Promise<T>)[], cap: number): Promise<T[]> {
	const results: T[] = new Array(jobs.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: cap }, async () => {
			while (next < jobs.length) {
				const i = next++;
				results[i] = await jobs[i]();
			}
		})
	);
	return results;
}

// --- students ---
const students = doc.students.filter((s) => !s.absent);
const total = (s: StoredStudent) => entries.reduce((sum, e) => sum + doc.marks[s.id][e.id], 0);
const available = entries.reduce((s, e) => s + e.marks, 0);
const sorted = [...students].sort((a, b) => total(a) - total(b));
const chosen =
	args.students === 'all'
		? students
		: args.students
			? students.filter((s) => args.students.split(',').includes(s.surname))
			: [0, 0.25, 0.5, 0.75, 1].map((q) => sorted[Math.round(q * (sorted.length - 1))]);

const grade = (t: number) => BOUNDARIES.find(([, min]) => t >= min)?.[0] ?? BELOW;
const toNext = (t: number) => {
	const above = BOUNDARIES.filter(([, min]) => min > t).at(-1);
	return above ? `${above[1] - t} to ${above[0]}` : 'top grade';
};

const plans = chosen.map((s) => {
	const marks = doc.marks[s.id];
	const { strengths, areas } = select(marks);
	const payload: StudentPayload = {
		paper: doc.paper.label ?? 'Untitled paper',
		strengths: strengths.map((c, i) => toItem(c, `strength-${i + 1}`, marks)),
		areasForImprovement: areas.map((c, i) => toItem(c, `area-${i + 1}`, marks))
	};
	return { s, t: total(s), strengths, areas, payload };
});

const jobs = plans.flatMap((p) =>
	MODELS.map((m) => () => call(m, p.payload).then((r) => ({ p, m, ...r })))
);
console.error(
	`${jobs.length} calls (${plans.length} students × ${MODELS.length} models), prompt ${PROMPT_VERSION}`
);
const results = await pool(jobs, CAP);

// --- review file ---
const pct = (g: number, a: number) => `${Math.round((100 * g) / a)}%`;
const lines: string[] = [
	`# Feedback run — prompt ${PROMPT_VERSION}${args.fixture ? `, fixture ${args.fixture}` : ''}`,
	'',
	`Paper: ${doc.paper.label} (${doc.paper.className}), ${available} marks. Models: ${MODELS.join(', ')}.`,
	''
];
let spend = 0;
for (const p of plans) {
	lines.push(
		`## ${p.s.firstName} ${p.s.surname} — ${p.t}/${available} (${pct(p.t, available)}), grade ${grade(p.t)}, ${toNext(p.t)}`,
		''
	);
	lines.push('| Section | Item | Labels | Marks | Band |', '| - | - | - | - | - |');
	for (const [sec, cs] of [
		['Strength', p.strengths],
		['Area', p.areas]
	] as const)
		for (const c of cs)
			lines.push(
				`| ${sec} | ${c.name} | ${c.entries.map((e) => e.label).join(', ')} | ${c.gained}/${c.available} | ${c.band} |`
			);
	lines.push('');
	for (const r of results.filter((r) => r.p === p)) {
		const last = r.attempts.at(-1)!;
		const cost = r.attempts.reduce((s, a) => s + (a.cost ?? 0), 0);
		spend += cost;
		lines.push(
			`### ${r.m} — ${r.out ? 'OK' : 'FAILED'}, ${r.attempts.length} attempt(s), ${last.ms} ms, ${last.tokens ?? '?'} tok, $${cost.toFixed(5)}`,
			''
		);
		for (const [i, a] of r.attempts.entries())
			if (!a.ok) lines.push(`> attempt ${i + 1}: ${a.problems.join('; ')}`, '');
		const out = r.out ?? last.feedback;
		if (!out) continue;
		const name = (ref: string) =>
			[...p.payload.strengths, ...p.payload.areasForImprovement].find((i) => i.ref === ref)?.name ??
			ref;
		lines.push('**Strengths**', '');
		for (const x of out.strengths)
			lines.push(`- _${name(x.ref)}_ — ${x.text} (${x.text.split(/\s+/).length}w)`);
		lines.push('', '**Areas for improvement**', '');
		for (const x of out.areasForImprovement)
			lines.push(`- _${name(x.ref)}_ — ${x.text} (${x.text.split(/\s+/).length}w)`);
		lines.push('');
	}
}
lines.push(
	`---`,
	`Total spend: $${spend.toFixed(4)}`,
	'',
	'<details><summary>Example payload (first student)</summary>',
	'',
	'```json',
	JSON.stringify(plans[0].payload, null, 2),
	'```',
	'</details>'
);

const outDir = join(dirname(SAMPLE), 'feedback-runs');
mkdirSync(outDir, { recursive: true });
const file = join(
	outDir,
	`${new Date().toISOString().replace(/[:.]/g, '-')}-${PROMPT_VERSION}${args.fixture ? `-${args.fixture}` : ''}.md`
);
writeFileSync(file, lines.join('\n'));
console.log(file);
