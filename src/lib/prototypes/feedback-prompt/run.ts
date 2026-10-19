// PROTOTYPE (throwaway) — "Prototype: feedback prompt against real marks" (#49).
//
// Reads a marksheet backup, builds one payload per student, sends one OpenRouter call per student
// per model with a strict json_schema, runs the local checks, and writes a review file to read.
//
//   npm run proto:feedback -- [--mode selected|holistic] [--sample PATH] [--models a,b]
//                             [--students 01,05|all] [--fixture spec]
//
// --mode selected (v1–v2): items selected locally by the #48 rules, one prose line per item.
// --mode holistic (v3+, default): the model sees the whole paper and picks the themes; local
//   checks enforce the #48 guard-rails instead.
// --fixture spec overlays hand-assigned H556 specification points, AOs and command words on the
//   real 13OA marks so the topic path is exercised (synthetic; the real sample has none).

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
import {
	HOLISTIC_PROMPT,
	HOLISTIC_VERSION,
	holisticSchema,
	type HolisticPayload
} from './prompt-holistic.js';

const args = Object.fromEntries(
	process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => {
		if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
		return acc;
	}, [])
);
const SAMPLE = args.sample ?? '.scratch/qla-backup-thermal-physics-2026-10-19.json';
const MODE = args.mode ?? 'holistic';
const VERSION = MODE === 'holistic' ? HOLISTIC_VERSION : PROMPT_VERSION;
const MODELS = (args.models ?? 'openai/gpt-6-luna').split(',');
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

// --- local checks ---
const paperLabels = new Set(entries.map((e) => e.label.toLowerCase()));

/** What the review file shows per item, whichever mode produced it. */
interface Shown {
	strengths: { heading: string; text: string }[];
	areas: { heading: string; text: string }[];
}
interface Verdict {
	problems: string[];
	shown?: Shown;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isList = <T>(v: unknown, item: (x: Record<string, unknown>) => boolean): v is T[] =>
	Array.isArray(v) && v.every((x) => isObj(x) && item(x));

/** Digits are figures; in selected mode "Q8c" / "Question 8c" for a handed label is allowed. */
function figures(ref: string, text: string, allowLabels: Set<string> | null): string[] {
	const problems: string[] = [];
	const rest = allowLabels
		? text.replace(/\b(?:Q|Questions?\s+)(\d+[a-z]*)\b/gi, (whole, label: string) => {
				if (!paperLabels.has(label.toLowerCase()))
					problems.push(`${ref}: unknown label "${whole}"`);
				else if (!allowLabels.has(label.toLowerCase()))
					problems.push(`${ref}: label "${whole}" not handed`);
				return '';
			})
		: text;
	for (const m of rest.matchAll(/\S*\d\S*/g)) problems.push(`${ref}: figure "${m[0]}"`);
	return problems;
}

type Prose = { ref: string; text: string };
const isProse = (x: Record<string, unknown>) =>
	typeof x.ref === 'string' && typeof x.text === 'string';

function checkSelected(payload: StudentPayload, out: unknown): Verdict {
	if (
		!isObj(out) ||
		!isList<Prose>(out.strengths, isProse) ||
		!isList<Prose>(out.areasForImprovement, isProse)
	)
		return { problems: ['wrong shape'] };
	const sections = { strengths: out.strengths, areasForImprovement: out.areasForImprovement };
	const all = [...payload.strengths, ...payload.areasForImprovement];
	const handed = new Set(all.flatMap((i) => i.questions.map((q) => q.label.toLowerCase())));
	const problems: string[] = [];
	for (const section of ['strengths', 'areasForImprovement'] as const) {
		const got = sections[section].map((x) => x.ref);
		const want = payload[section].map((i) => i.ref);
		if (got.length !== want.length || want.some((r) => got.filter((g) => g === r).length !== 1))
			problems.push(`${section}: refs ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
		for (const x of sections[section]) problems.push(...figures(x.ref, x.text, handed));
	}
	const heading = (ref: string) => all.find((i) => i.ref === ref)?.name ?? ref;
	const show = (xs: Prose[]) => xs.map((x) => ({ heading: heading(x.ref), text: x.text }));
	return {
		problems,
		shown: { strengths: show(out.strengths), areas: show(out.areasForImprovement) }
	};
}

type Theme = { text: string; questions: string[] };
const isTheme = (x: Record<string, unknown>) =>
	typeof x.text === 'string' &&
	Array.isArray(x.questions) &&
	x.questions.every((q) => typeof q === 'string');

function checkHolistic(payload: HolisticPayload, out: unknown): Verdict {
	if (
		!isObj(out) ||
		!isList<Theme>(out.strengths, isTheme) ||
		!isList<Theme>(out.areasForImprovement, isTheme)
	)
		return { problems: ['wrong shape'] };
	const q = new Map(payload.questions.map((x) => [x.label, x]));
	const problems: string[] = [];
	if (out.strengths.length > 3) problems.push(`${out.strengths.length} strengths`);
	if (out.areasForImprovement.length > 2) problems.push(`${out.areasForImprovement.length} areas`);
	const anyDropped = payload.questions.some((x) => x.gained < x.available);
	if (anyDropped && !out.areasForImprovement.length)
		problems.push('no areas despite dropped marks');
	const used = { strength: new Set<string>(), area: new Set<string>() };
	for (const [kind, themes] of [
		['strength', out.strengths],
		['area', out.areasForImprovement]
	] as const) {
		themes.forEach((t, i) => {
			const ref = `${kind}-${i + 1}`;
			if (!t.questions.length) problems.push(`${ref}: no questions`);
			for (const label of t.questions) {
				const x = q.get(label);
				if (!x) problems.push(`${ref}: unknown label ${label}`);
				else if (kind === 'strength' && facilityBand(x.gained / x.available) === 'red')
					problems.push(`${ref}: red question ${label} as a strength`);
				else if (kind === 'area' && x.gained === x.available)
					problems.push(`${ref}: full-marks question ${label} as an area`);
				used[kind].add(label);
			}
			problems.push(...figures(ref, t.text, null));
		});
	}
	for (const label of used.strength)
		if (used.area.has(label)) problems.push(`${label} is in both a strength and an area`);
	const heading = (t: Theme) =>
		t.questions.map((l) => `${l} ${q.get(l)?.gained}/${q.get(l)?.available}`).join(', ');
	const show = (ts: Theme[]) => ts.map((t) => ({ heading: heading(t), text: t.text }));
	return {
		problems,
		shown: { strengths: show(out.strengths), areas: show(out.areasForImprovement) }
	};
}

// --- transport ---
interface Request {
	system: string;
	user: string;
	schema: object;
	validate: (out: unknown) => Verdict;
}
interface Attempt {
	ok: boolean;
	problems: string[];
	ms: number;
	cost?: number;
	tokens?: string;
	shown?: Shown;
}

async function call(model: string, req: Request): Promise<{ out?: Shown; attempts: Attempt[] }> {
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
						{ role: 'system', content: req.system },
						{ role: 'user', content: req.user }
					],
					response_format: { type: 'json_schema', json_schema: req.schema },
					provider: { require_parameters: true },
					max_tokens: 8000,
					...(args.effort ? { reasoning: { effort: args.effort } } : {}),
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
				tokens: `${u.prompt_tokens}/${u.completion_tokens}${u.completion_tokens_details?.reasoning_tokens ? ` (${u.completion_tokens_details.reasoning_tokens} reasoning)` : ''}`
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
			const { problems, shown } = req.validate(out);
			attempts.push({ ...base, ok: !problems.length, problems, shown });
			if (!problems.length) return { out: shown, attempts };
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
const paper = doc.paper.label ?? 'Untitled paper';

function holisticPayload(marks: Record<string, number>): HolisticPayload {
	const topics = candidates(marks).filter((c) => c.kind === 'topic');
	return {
		paper,
		questions: entries.map((e) => ({
			label: e.label,
			summary: e.summary,
			commandWord: e.commandWord,
			ao: e.ao,
			topics: codes(e.specPoint).map((c) => TOPIC_NAMES[c] ?? c),
			gained: marks[e.id],
			available: e.marks
		})),
		topics: topics.map((t) => ({ name: t.name, gained: t.gained, available: t.available }))
	};
}

const plans = chosen.map((s) => {
	const marks = doc.marks[s.id];
	const { strengths, areas } = select(marks);
	if (MODE === 'holistic') {
		const payload = holisticPayload(marks);
		const req: Request = {
			system: HOLISTIC_PROMPT,
			user: JSON.stringify(payload, null, 2),
			schema: holisticSchema(payload),
			validate: (out) => checkHolistic(payload, out)
		};
		return { s, t: total(s), strengths, areas, payload, req };
	}
	const payload: StudentPayload = {
		paper,
		strengths: strengths.map((c, i) => toItem(c, `strength-${i + 1}`, marks)),
		areasForImprovement: areas.map((c, i) => toItem(c, `area-${i + 1}`, marks))
	};
	const req: Request = {
		system: SYSTEM_PROMPT,
		user: JSON.stringify(payload, null, 2),
		schema: outputSchema(payload),
		validate: (out) => checkSelected(payload, out)
	};
	return { s, t: total(s), strengths, areas, payload, req };
});

const jobs = plans.flatMap((p) =>
	MODELS.map((m) => () => call(m, p.req).then((r) => ({ p, m, ...r })))
);
console.error(
	`${jobs.length} calls (${plans.length} students × ${MODELS.length} models), ${MODE} ${VERSION}`
);
const results = await pool(jobs, CAP);

// --- review file ---
const pct = (g: number, a: number) => `${Math.round((100 * g) / a)}%`;
const lines: string[] = [
	`# Feedback run — ${MODE} ${VERSION}${args.fixture ? `, fixture ${args.fixture}` : ''}${args.effort ? `, effort ${args.effort}` : ''}`,
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
	lines.push(
		`Local selection (${MODE === 'holistic' ? 'for comparison, not sent' : 'sent'}):`,
		'',
		'| Section | Item | Labels | Marks | Band |',
		'| - | - | - | - | - |'
	);
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
		const out = r.out ?? last.shown;
		if (!out) continue;
		const words = (t: string) => t.split(/\s+/).length;
		lines.push('**Strengths**', '');
		for (const x of out.strengths) lines.push(`- _${x.heading}_ — ${x.text} (${words(x.text)}w)`);
		lines.push('', '**Areas for improvement**', '');
		for (const x of out.areas) lines.push(`- _${x.heading}_ — ${x.text} (${words(x.text)}w)`);
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
	`${new Date().toISOString().replace(/[:.]/g, '-')}-${MODE}-${VERSION}${args.fixture ? `-${args.fixture}` : ''}${args.effort ? `-${args.effort}` : ''}.md`
);
writeFileSync(file, lines.join('\n'));
console.log(file);
