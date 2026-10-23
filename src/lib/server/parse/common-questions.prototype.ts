// PROTOTYPE — throwaway, not production (QLA #109: common-question matching prompt).
//
// Step 1 parses each tier's QP+MS once with today's real parse (`callModel`), caching the
// breakdowns in .scratch/prototype-109-cache (PROTOTYPE, wipe me). Step 2 runs the candidate
// matching call — both tiers' documents attached natively, both entry lists as fenced JSON,
// strict json_schema — and scores the proposed pairs against the true pairs from #106, before
// and after the local checks (ids exist, one-to-one, equal marks).
//
// Run:  node src/lib/server/parse/common-questions.prototype.ts [reps] [variant,…] [case,…]
// Needs OPENROUTER_API_KEY in .env and the paper set at ~/Work/QLA/.scratch/papers (#106).

import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

process.loadEnvFile('.env');

registerHooks({
	resolve(specifier, context, next) {
		if (specifier === '$env/dynamic/private') {
			return { url: 'data:text/javascript,export const env = process.env;', shortCircuit: true };
		}
		if (specifier.startsWith('$lib/')) {
			return next(
				new URL(`../../${specifier.slice(5)}`, import.meta.url).href.replace(/\.js$/, '.ts'),
				context
			);
		}
		if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
			return next(`${specifier}.ts`, context);
		}
		if (specifier.startsWith('.') && specifier.endsWith('.js')) {
			return next(specifier.replace(/\.js$/, '.ts'), context);
		}
		return next(specifier, context);
	}
});
const { parsePdfBytes, toPdfDataUrl, buildHybridPayload, DEFAULT_MODEL_ID } = await import('./pdf');
const { usageFrom, extractJsonText, contentToText, OPENROUTER_URL } = await import('./model');
const { applyQuestionNumberFallback } = await import('./validate');
const { fenceDocuments } = await import('../fence');

const PAPERS = join(homedir(), 'Work/QLA/.scratch/papers');
const CACHE = '.scratch/prototype-109-cache';
mkdirSync(CACHE, { recursive: true });

// ---- tiers and truth --------------------------------------------------------------------

interface Tier {
	key: string;
	qp?: string;
	ms: string;
}
const T = (key: string, dir: string, code: string, qp = true): Tier => ({
	key,
	...(qp ? { qp: join(PAPERS, dir, `${code}-QP.pdf`) } : {}),
	ms: join(PAPERS, dir, `${code}-MS.pdf`)
});
const PHY = 'aqa/gcse-physics-8463/2023-june';
const MATHS = 'aqa/gcse-maths-8300/2023-june';
const PEARSON = 'pearson/gcse-maths-1ma1/2024-june';
const TIERS: Record<string, Tier> = Object.fromEntries(
	[
		T('8463-1H', PHY, '8463-1H'),
		T('8463-1F', PHY, '8463-1F'),
		T('8463-2H', PHY, '8463-2H'),
		T('8463-2F', PHY, '8463-2F'),
		T('8300-1H', MATHS, '8300-1H'),
		T('8300-1F', MATHS, '8300-1F'),
		T('1MA1-1H', PEARSON, '1MA1-1H'),
		T('1MA1-1F', PEARSON, '1MA1-1F')
	].map((t) => [t.key, t])
);

interface Case {
	name: string;
	tier1: string;
	tier2: string;
	/** Question-level truth as [tier1 questionNumber, tier2 questionNumber]; parts are zipped in order. */
	truth: Array<[string, string]>;
	/** Which documents each tier contributes to the matching call. */
	docs: 'qp' | 'ms' | 'qp+ms';
}
const CASES: Case[] = [
	{
		name: '8463 P1 H|F',
		tier1: '8463-1H',
		tier2: '8463-1F',
		docs: 'qp',
		truth: [
			['1', '8'],
			['2', '9'],
			['3', '10']
		]
	},
	{
		name: '8463 P2 F|H',
		tier1: '8463-2F',
		tier2: '8463-2H',
		docs: 'qp',
		truth: [
			['9', '1'],
			['10', '2']
		]
	},
	// #106 listed F22–26 = H3–7; the first run's "false pairs" F20 = H1 (nth term) and F21 = H2 (fractions, Kevin) are verbatim common too (checked in the PDFs).
	{
		name: '1MA1 P1 F|H',
		tier1: '1MA1-1F',
		tier2: '1MA1-1H',
		docs: 'qp',
		truth: [
			['20', '1'],
			['21', '2'],
			['22', '3'],
			['23', '4'],
			['24', '5'],
			['25', '6'],
			['26', '7']
		]
	},
	// #106 listed H4–5, H8–10; H6 = F19 (Andrew and Bruce ratio) and H7 = F21 (2^a × 3 × 5^2 = 600) are verbatim common too. F20 is Foundation-only.
	{
		name: '8300 P1 H|F',
		tier1: '8300-1H',
		tier2: '8300-1F',
		docs: 'qp',
		truth: [
			['4', '17'],
			['5', '18'],
			['6', '19'],
			['7', '21'],
			['8', '22'],
			['9', '23'],
			['10', '24']
		]
	},
	{
		name: '8463 P1 H|F MS only',
		tier1: '8463-1H',
		tier2: '8463-1F',
		docs: 'ms',
		truth: [
			['1', '8'],
			['2', '9'],
			['3', '10']
		]
	},
	{ name: 'NEG 8463 1H|2F', tier1: '8463-1H', tier2: '8463-2F', docs: 'qp', truth: [] },
	{ name: 'NEG 1MA1-1H|8300-1F', tier1: '1MA1-1H', tier2: '8300-1F', docs: 'qp', truth: [] }
];

// ---- step 1: cached real parses -----------------------------------------------------------

interface Entry {
	id: string;
	questionNumber: string;
	marks: number | null;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
}

async function ingest(path: string) {
	const raw = readFileSync(path);
	const pdfBase64 = raw.toString('base64'); // before parsePdfBytes: unpdf detaches the buffer
	const parsed = await parsePdfBytes(new Uint8Array(raw));
	return {
		filename: path.split('/').pop()!,
		pageCount: parsed.pageCount,
		text: parsed.textWithMarkers,
		pdfBase64
	};
}

async function breakdownFor(tier: Tier): Promise<Entry[]> {
	const file = join(CACHE, `${tier.key}.json`);
	if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
	const [paper, markscheme] = await Promise.all([
		tier.qp ? ingest(tier.qp) : undefined,
		ingest(tier.ms)
	]);
	// Today's real parse payload; only max_tokens is raised (see the report: 4000 cuts long Foundation papers off).
	const payload = buildHybridPayload({
		modelId: DEFAULT_MODEL_ID,
		useNativePdf: true,
		paperText: paper?.text ?? null,
		markschemeText: markscheme.text,
		paperFilename: paper?.filename ?? null,
		paperPdfBase64: paper?.pdfBase64 ?? null,
		markschemeFilename: markscheme.filename,
		markschemePdfBase64: markscheme.pdfBase64
	});
	for (let attempt = 1; attempt <= 2; attempt++) {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'X-Title': 'QLA #109 matching prototype (parse)'
			},
			body: JSON.stringify({ ...payload, max_tokens: 16000 })
		});
		const body = await res.json();
		const choice = body.choices?.[0];
		const usage = usageFrom(body.usage, DEFAULT_MODEL_ID);
		console.log(
			`parse ${tier.key} attempt ${attempt}: finish ${choice?.finish_reason}, ${body.usage?.completion_tokens} completion tokens, ${(usage.estCost * 100).toFixed(2)}¢`
		);
		try {
			const parsed = JSON.parse(extractJsonText(contentToText(choice?.message?.content ?? '')));
			applyQuestionNumberFallback(parsed);
			const entries: Entry[] = parsed.questions;
			writeFileSync(file, JSON.stringify(entries, null, 1));
			console.log(
				`parsed ${tier.key}: ${entries.length} entries, ${entries.reduce((s, e) => s + (e.marks ?? 0), 0)} marks`
			);
			return entries;
		} catch {
			console.log(`parse ${tier.key} attempt ${attempt}: unparseable`);
		}
	}
	throw new Error(`parse failed: ${tier.key}`);
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/^q(uestion)?\s*/, '')
		.split(/[.\s]+/)
		.map((seg) => seg.replace(/^0+(?=\w)/, ''))
		.join('.');

/** Entry-level truth: each true question pair's parts zipped in paper order. */
function truePairs(c: Case, e1: Entry[], e2: Entry[]): { pairs: Set<string>; problems: string[] } {
	const pairs = new Set<string>();
	const problems: string[] = [];
	for (const [q1, q2] of c.truth) {
		const p1 = e1.filter((e) => norm(e.questionNumber) === norm(q1));
		const p2 = e2.filter((e) => norm(e.questionNumber) === norm(q2));
		if (p1.length !== p2.length || p1.length === 0) {
			problems.push(`Q${q1}↔Q${q2}: ${p1.length} vs ${p2.length} parsed parts`);
			continue;
		}
		p1.forEach((a, i) => {
			if (a.marks !== p2[i].marks)
				problems.push(`${a.id}↔${p2[i].id}: marks ${a.marks} vs ${p2[i].marks}`);
			pairs.add(`${a.id}|${p2[i].id}`);
		});
	}
	return { pairs, problems };
}

// ---- step 2: the matching call -----------------------------------------------------------

const RULES = [
	'You are given the two tiers of one assessment. Each tier has its documents attached as PDFs (the data says which filenames belong to which tier) and its breakdown entries: one per separately marked question or subquestion, with id, questionNumber, marks, summary, specPoint and commandWord.',
	'Find the common questions: an entry in Tier 1 and an entry in Tier 2 that are the same question printed in both papers — the same wording for that part, the same diagram, table or data, asking for the same answer, for the same marks. The question number almost always differs between the tiers.',
	'Compare the printed question text in the PDFs, part by part. The summaries, spec points and command words are only a guide to finding candidates; two entries with similar summaries are NOT common unless the printed wording of that part is the same.',
	'A shared scenario, context or opening sentence is NOT enough. When a question in each tier opens on the same context but its parts ask different things, pair none of those parts; pair only the parts whose own wording is the same. Never pair because the topic or skill is the same.',
	'Position carries no information: a common block is often at the end of one tier and the start of the other.',
	'Each pair is one Tier 1 entry and one Tier 2 entry. An entry appears in at most one pair. Both entries of a pair have the same marks.',
	'Many assessments share no questions across tiers, and the papers may not even be from the same exam. Returning an empty pairs list is correct when nothing is common.',
	'Copy ids exactly as given in the data.'
];

interface Variant {
	name: string;
	prompt: string;
	schema: Record<string, unknown>;
}
const pairItem = (extra: Record<string, unknown>) => ({
	type: 'object',
	additionalProperties: false,
	required: [...Object.keys(extra), 'tier1Id', 'tier2Id'],
	properties: { ...extra, tier1Id: { type: 'string' }, tier2Id: { type: 'string' } }
});
const pairsSchema = (item: Record<string, unknown>) => ({
	type: 'object',
	additionalProperties: false,
	required: ['pairs'],
	properties: { pairs: { type: 'array', items: item } }
});
const VARIANTS: Variant[] = [
	{ name: 'bare', prompt: RULES.join('\n'), schema: pairsSchema(pairItem({})) },
	{
		name: 'quoted',
		prompt: [
			...RULES,
			"For each pair, first give sharedWording: a short phrase (5–15 words) of that part's own question wording, copied from the printed papers, that appears in both tiers. If you cannot quote one, the entries are not a pair."
		].join('\n'),
		schema: pairsSchema(pairItem({ sharedWording: { type: 'string' } }))
	}
];

const dataEntries = (es: Entry[]) =>
	es.map(({ id, questionNumber, marks, summary, specPoint, commandWord }) => ({
		id,
		questionNumber,
		marks,
		summary,
		specPoint,
		commandWord
	}));

interface Run {
	c: Case;
	v: Variant;
	error?: string;
	raw?: Array<{ tier1Id: string; tier2Id: string; sharedWording?: string }>;
	kept?: string[];
	dropped?: string[];
	secs: string;
	cost: number;
}

async function match(c: Case, v: Variant, e1: Entry[], e2: Entry[]): Promise<Run> {
	const t1 = TIERS[c.tier1];
	const t2 = TIERS[c.tier2];
	const docsOf = (t: Tier) => [
		...(c.docs !== 'ms' && t.qp ? [t.qp] : []),
		...(c.docs !== 'qp' ? [t.ms] : [])
	];
	const d1 = docsOf(t1);
	const d2 = docsOf(t2);
	const name = (p: string) => p.split('/').pop()!;
	const data = {
		tier1: { documents: d1.map(name), entries: dataEntries(e1) },
		tier2: { documents: d2.map(name), entries: dataEntries(e2) }
	};
	const dataJson = JSON.stringify(data);
	const { open, close, directive } = fenceDocuments(dataJson);
	const files = [...d1, ...d2].map((p) => ({
		type: 'file',
		file: { filename: name(p), file_data: toPdfDataUrl(readFileSync(p).toString('base64')) }
	}));
	const started = Date.now();
	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'X-Title': 'QLA #109 matching prototype'
		},
		body: JSON.stringify({
			model: DEFAULT_MODEL_ID,
			max_tokens: 16000,
			stream: false,
			response_format: {
				type: 'json_schema',
				json_schema: { name: 'common_questions', strict: true, schema: v.schema }
			},
			provider: { require_parameters: true },
			plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
			messages: [
				{ role: 'system', content: [v.prompt, directive].join('\n\n') },
				{
					role: 'user',
					content: [{ type: 'text', text: [open, dataJson, close].join('\n') }, ...files]
				}
			]
		})
	}).catch((e) => e as Error);
	const secs = ((Date.now() - started) / 1000).toFixed(0);
	if (res instanceof Error)
		return { c, v, error: `fetch: ${String(res.cause ?? res)}`, secs, cost: 0 };
	if (!res.ok)
		return { c, v, error: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`, secs, cost: 0 };
	const body = await res.json();
	const cost = usageFrom(body.usage, DEFAULT_MODEL_ID).estCost;
	const choice = body.choices?.[0];
	if (choice?.finish_reason === 'length') return { c, v, error: 'cut off', secs, cost };
	let raw: Run['raw'];
	try {
		raw = JSON.parse(extractJsonText(contentToText(choice?.message?.content ?? ''))).pairs;
	} catch {
		return { c, v, error: 'unparseable', secs, cost };
	}
	// Local checks: both ids exist, equal non-null marks, one-to-one (first claim wins).
	const m1 = new Map(e1.map((e) => [e.id, e]));
	const m2 = new Map(e2.map((e) => [e.id, e]));
	const used1 = new Set<string>();
	const used2 = new Set<string>();
	const kept: string[] = [];
	const dropped: string[] = [];
	for (const p of raw!) {
		const a = m1.get(p.tier1Id);
		const b = m2.get(p.tier2Id);
		const key = `${p.tier1Id}|${p.tier2Id}`;
		if (!a || !b) dropped.push(`${key} (unknown id)`);
		else if (a.marks === null || a.marks !== b.marks)
			dropped.push(`${key} (marks ${a.marks}≠${b.marks})`);
		else if (used1.has(a.id) || used2.has(b.id)) dropped.push(`${key} (not one-to-one)`);
		else {
			used1.add(a.id);
			used2.add(b.id);
			kept.push(key);
		}
	}
	return { c, v, raw, kept, dropped, secs, cost };
}

// ---- run ---------------------------------------------------------------------------------

const reps = Number(process.argv[2] ?? 3);
const vFilter = process.argv[3]?.split(',');
const cFilter = process.argv[4]?.split(',');
const variants = VARIANTS.filter((v) => !vFilter || vFilter.includes(v.name));
const cases = CASES.filter((c) => !cFilter || cFilter.some((f) => c.name.includes(f)));

const needed = [...new Set(cases.flatMap((c) => [c.tier1, c.tier2]))];
const entries: Record<string, Entry[]> = {};
for (let i = 0; i < needed.length; i += 4) {
	await Promise.all(
		needed.slice(i, i + 4).map(async (k) => (entries[k] = await breakdownFor(TIERS[k])))
	);
}

const truth = new Map(cases.map((c) => [c, truePairs(c, entries[c.tier1], entries[c.tier2])]));
for (const [c, t] of truth) {
	console.log(
		`truth ${c.name}: ${t.pairs.size} entry pairs${t.problems.length ? `; PROBLEMS: ${t.problems.join('; ')}` : ''}`
	);
}

const queue = cases.flatMap((c) =>
	variants.flatMap((v) => Array.from({ length: reps }, () => ({ c, v })))
);
const runs: Run[] = [];
await Promise.all(
	Array.from({ length: 4 }, async () => {
		for (let job = queue.shift(); job; job = queue.shift()) {
			const r = await match(job.c, job.v, entries[job.c.tier1], entries[job.c.tier2]);
			runs.push(r);
			console.log(`done ${r.c.name} ${r.v.name} ${r.secs}s ${r.error ?? `${r.kept!.length} kept`}`);
		}
	})
);
runs.sort(
	(a, b) => cases.indexOf(a.c) - cases.indexOf(b.c) || variants.indexOf(a.v) - variants.indexOf(b.v)
);

const lines = [
	`Model ${DEFAULT_MODEL_ID}, ${reps} rep(s). TP/FP/FN after local checks; raw = pairs the model proposed.`,
	'',
	'| Case | Variant | True | Raw | Kept | TP | FP | FN | Dropped by checks | s | ¢ |',
	'|---|---|---|---|---|---|---|---|---|---|---|'
];
const detail: string[] = [];
const totals = new Map<
	string,
	{ tp: number; fp: number; fn: number; cost: number; errors: number }
>();
for (const r of runs) {
	const t = truth.get(r.c)!.pairs;
	const tot = totals.get(r.v.name) ?? { tp: 0, fp: 0, fn: 0, cost: 0, errors: 0 };
	tot.cost += r.cost;
	if (r.error) {
		tot.errors++;
		totals.set(r.v.name, tot);
		lines.push(
			`| ${r.c.name} | ${r.v.name} | ${t.size} | ERROR: ${r.error} | | | | | | ${r.secs} | ${(r.cost * 100).toFixed(2)} |`
		);
		continue;
	}
	const kept = new Set(r.kept);
	const fps = [...kept].filter((k) => !t.has(k));
	const fns = [...t].filter((k) => !kept.has(k));
	const tp = kept.size - fps.length;
	tot.tp += tp;
	tot.fp += fps.length;
	tot.fn += fns.length;
	totals.set(r.v.name, tot);
	lines.push(
		`| ${r.c.name} | ${r.v.name} | ${t.size} | ${r.raw!.length} | ${kept.size} | ${tp} | ${fps.length} | ${fns.length} | ${r.dropped!.join(', ')} | ${r.secs} | ${(r.cost * 100).toFixed(2)} |`
	);
	if (fps.length || fns.length) {
		const quote = (k: string) => {
			const q = r.raw!.find((p) => `${p.tier1Id}|${p.tier2Id}` === k)?.sharedWording;
			return q ? `${k} “${q}”` : k;
		};
		detail.push(
			`- ${r.c.name} / ${r.v.name}: FP ${fps.map(quote).join('; ') || '—'} · FN ${fns.join(', ') || '—'}`
		);
	}
}
lines.push('', '| Variant | Precision | Recall | Errors | Total ¢ |', '|---|---|---|---|---|');
for (const [name, t] of totals) {
	lines.push(
		`| ${name} | ${t.tp}/${t.tp + t.fp} = ${((100 * t.tp) / Math.max(1, t.tp + t.fp)).toFixed(0)}% | ${t.tp}/${t.tp + t.fn} = ${((100 * t.tp) / Math.max(1, t.tp + t.fn)).toFixed(0)}% | ${t.errors} | ${(t.cost * 100).toFixed(1)} |`
	);
}
if (detail.length) lines.push('', '### Misses and false pairs', '', ...detail);
const report = lines.join('\n');
console.log('\n' + report);
writeFileSync(join(CACHE, 'report.md'), report);
