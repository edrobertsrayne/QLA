// PROTOTYPE — throwaway, not production (QLA #108: tier-name extraction in the parse prompt).
//
// Runs today's real parse prompt (`buildPromptText`) plus one candidate `tierName`
// instruction against real board PDFs, natively attached exactly as `/api/parse` does,
// and prints what comes back. Answers: does a nullable verbatim tier name come back
// reliably, and does the paper number ever leak in as a tier?
//
// Run:  node src/lib/server/parse/tier-name.prototype.ts [reps]
// Needs OPENROUTER_API_KEY in .env and the paper set at ~/Work/QLA/.scratch/papers (#106).

import { registerHooks } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.loadEnvFile('.env');

// SvelteKit's `$env/dynamic/private` and extensionless relative imports only resolve under
// Vite; shim both so the real prompt builder runs under plain node.
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === '$env/dynamic/private') {
			return { url: 'data:text/javascript,export const env = process.env;', shortCircuit: true };
		}
		if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
			return next(`${specifier}.ts`, context);
		}
		return next(specifier, context);
	}
});

// Dynamic import: pdf.ts → env.ts imports `$env/dynamic/private`, which only resolves
// once the shim above is registered; a static import would resolve before it.
const { buildPromptText, parsePdfBytes, toPdfDataUrl, DEFAULT_MODEL_ID, OPENROUTER_MAX_TOKENS } =
	await import('./pdf');
const { usageFrom, extractJsonText, contentToText, OPENROUTER_URL } = await import('./model');

// The candidate instruction under test. It rides on the end of the real parse prompt.
const TIER_NAME_INSTRUCTION = [
	'Top level also has tierName: the tier this paper is set at, lifted from the documents themselves (cover, title page or running header) — NEVER from a filename.',
	'Copy the tier words verbatim as printed (e.g. "Higher Tier", "Foundation Tier", "Higher"), dropping only the wording around them such as the paper number, calculator rubric or brackets (e.g. "Higher (Calculator) Paper 2H" gives "Higher").',
	'If the tier appears only as the letter suffix of the paper code (e.g. 8300/1H, 1MA1/2F), give the word that letter stands for: H gives "Higher", F gives "Foundation".',
	'A paper number, paper title, qualification level or calculator rubric is NEVER a tier: "Paper 1", "Paper 2", "01", "Modelling physics", "A-level", "AS", "GCSE", "Non-Calculator" are not tiers.',
	'When no tier is printed, tierName is null. When the assessment paper and markscheme both name the tier, use the assessment paper\'s wording.'
].join(' ');

const PAPERS = join(homedir(), 'Work/QLA/.scratch/papers');
const p = (rel: string) => join(PAPERS, rel);
const AQA_PHY = 'aqa/gcse-physics-8463/2023-june';
const AQA_MATHS = 'aqa/gcse-maths-8300/2023-june';
const AQA_AL = 'aqa/a-level-physics-7408/2023-june';
const OCR = 'ocr/a-level-physics-a-h556/2024-june';
const PEARSON = 'pearson/gcse-maths-1ma1/2024-june';

// Synthetic: 8463/1H markscheme minus its cover page, so the tier survives only
// as the "8463/1H" code in the running header. Neutral filename so the code is
// not readable from the name.
const tmp = mkdtempSync(join(tmpdir(), 'qla-108-'));
const codeOnlyMs = join(tmp, 'markscheme.pdf');
execFileSync('qpdf', [p(`${AQA_PHY}/8463-1H-MS.pdf`), '--pages', '.', '2-z', '--', codeOnlyMs]);

interface Doc {
	path: string;
	/** Filename the model sees (defaults to the real basename). */
	as?: string;
}
interface Case {
	name: string;
	kind: 'tier+paper no.' | 'paper no. only' | 'neither' | 'code letter only' | 'filename trap';
	expect: string | null;
	paper?: Doc;
	markscheme?: Doc;
}

const CASES: Case[] = [
	{ name: 'AQA 8463/1H QP+MS', kind: 'tier+paper no.', expect: 'Higher Tier', paper: { path: p(`${AQA_PHY}/8463-1H-QP.pdf`) }, markscheme: { path: p(`${AQA_PHY}/8463-1H-MS.pdf`) } },
	{ name: 'AQA 8300/1F QP only', kind: 'tier+paper no.', expect: 'Foundation Tier', paper: { path: p(`${AQA_MATHS}/8300-1F-QP.pdf`) } },
	{ name: 'Pearson 1MA1/1H QP only', kind: 'tier+paper no.', expect: 'Higher Tier', paper: { path: p(`${PEARSON}/1MA1-1H-QP.pdf`) } },
	{ name: 'AQA 8463/2F MS only', kind: 'tier+paper no.', expect: 'Foundation Tier', markscheme: { path: p(`${AQA_PHY}/8463-2F-MS.pdf`) } },
	{ name: 'Pearson 1MA1/2H MS only', kind: 'tier+paper no.', expect: 'Higher', markscheme: { path: p(`${PEARSON}/1MA1-2H-MS.pdf`) } },
	{ name: 'AQA 7408/1 QP+MS', kind: 'paper no. only', expect: null, paper: { path: p(`${AQA_AL}/7408-1-QP.pdf`) }, markscheme: { path: p(`${AQA_AL}/7408-1-MS.pdf`) } },
	{ name: 'AQA 7408/2 MS only', kind: 'paper no. only', expect: null, markscheme: { path: p(`${AQA_AL}/7408-2-MS.pdf`) } },
	{ name: 'OCR H556/01 QP+MS', kind: 'neither', expect: null, paper: { path: p(`${OCR}/H556-01-QP.pdf`) }, markscheme: { path: p(`${OCR}/H556-01-MS.pdf`) } },
	{ name: 'OCR H556/03 MS only', kind: 'neither', expect: null, markscheme: { path: p(`${OCR}/H556-03-MS.pdf`) } },
	{ name: '8463/1H MS, cover removed', kind: 'code letter only', expect: 'Higher', markscheme: { path: codeOnlyMs } },
	{ name: '7408/2 QP named "Y13 Higher mock.pdf"', kind: 'filename trap', expect: null, paper: { path: p(`${AQA_AL}/7408-2-QP.pdf`), as: 'Y13 Higher mock.pdf' } }
];

async function load(doc: Doc | undefined) {
	if (!doc) return null;
	const raw = readFileSync(doc.path);
	const base64 = raw.toString('base64'); // before parsePdfBytes: unpdf detaches the buffer it is given
	const parsed = await parsePdfBytes(new Uint8Array(raw));
	return {
		filename: doc.as ?? doc.path.split('/').pop()!,
		text: parsed.textWithMarkers,
		pages: parsed.pageCount,
		base64
	};
}

async function run(c: Case) {
	const [paper, markscheme] = await Promise.all([load(c.paper), load(c.markscheme)]);
	const prompt =
		buildPromptText({
			paperText: paper?.text ?? null,
			markschemeText: markscheme?.text ?? null,
			specText: null,
			useNativePdf: true
		}) +
		'\n\n' +
		TIER_NAME_INSTRUCTION;
	const files = [paper, markscheme]
		.filter((d) => d !== null)
		.map((d) => ({ type: 'file', file: { filename: d.filename, file_data: toPdfDataUrl(d.base64) } }));
	const started = Date.now();
	let res: Response;
	try {
		res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'X-Title': 'QLA #108 tier-name prototype'
			},
			body: JSON.stringify({
				model: DEFAULT_MODEL_ID,
				max_tokens: OPENROUTER_MAX_TOKENS,
				messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...files] }],
				plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }]
			})
		});
	} catch (error) {
		return { c, error: `fetch failed: ${String((error as Error).cause ?? error)}`, secs: '-' };
	}
	const secs = ((Date.now() - started) / 1000).toFixed(0);
	if (!res.ok) return { c, error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, secs };
	const body = await res.json();
	const usage = usageFrom(body.usage, DEFAULT_MODEL_ID);
	let out: { tierName?: unknown; questions?: Array<{ marks: number | null }> };
	try {
		out = JSON.parse(extractJsonText(contentToText(body.choices?.[0]?.message?.content ?? '')));
	} catch {
		return { c, error: 'unparseable JSON (likely max_tokens truncation)', secs, usage };
	}
	const marks = (out.questions ?? []).reduce((s, q) => s + (q.marks ?? 0), 0);
	return { c, tierName: out.tierName, entries: out.questions?.length ?? 0, marks, secs, usage };
}

const reps = Number(process.argv[2] ?? 2);
const queue = CASES.flatMap((c) => Array.from({ length: reps }, () => c));
const results = [];
// Four calls in flight: more large PDF uploads at once trip OpenRouter's HTTP/2 ENHANCE_YOUR_CALM.
await Promise.all(
	Array.from({ length: 4 }, async () => {
		for (let c = queue.shift(); c; c = queue.shift()) results.push(await run(c));
	})
);
results.sort((a, b) => CASES.indexOf(a.c) - CASES.indexOf(b.c));

let pass = 0;
let cost = 0;
const lines = ['| Case | Kind | Expected | Got | Entries / marks | s | ¢ |', '|---|---|---|---|---|---|---|'];
for (const r of results) {
	cost += r.usage?.estCost ?? 0;
	const fmt = (v: unknown) => (v === null ? 'null' : v === undefined ? '(missing)' : JSON.stringify(v));
	const ok = !('error' in r && r.error) && r.tierName === r.c.expect;
	if (ok) pass++;
	lines.push(
		`| ${r.c.name} | ${r.c.kind} | ${fmt(r.c.expect)} | ${'error' in r && r.error ? `ERROR: ${r.error}` : fmt(r.tierName)}${ok ? '' : ' ✗'} | ${'entries' in r ? `${r.entries} / ${r.marks}` : ''} | ${r.secs} | ${((r.usage?.estCost ?? 0) * 100).toFixed(2)} |`
	);
}
lines.push('', `${pass}/${results.length} exact. Total est. cost ${(cost * 100).toFixed(1)}¢.`);
const report = lines.join('\n');
console.log(report);
writeFileSync(join(tmp, 'report.md'), report);
console.log(`\nreport: ${join(tmp, 'report.md')}`);
