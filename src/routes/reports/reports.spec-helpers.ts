// Test-only: shared fixtures and fetch stubs for the reports page specs.
import { expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';

export const HOSTILE = '<img src=x onerror=window.__pwned=1> well done';

export function plain(over: Partial<MarksheetDocument> = {}): MarksheetDocument {
	const entries = [
		entry('entry-1', '1', '1', {
			marks: 4,
			summary: 'Define a term',
			specPoint: null,
			commandWord: null,
			ao: null
		}),
		entry('entry-2', '2a', '2', {
			marks: 6,
			summary: 'Explain the result',
			specPoint: null,
			commandWord: null,
			ao: null
		})
	];
	const names: [string, string, string, boolean][] = [
		['ada', 'Ada', 'Lovelace', false],
		['bo', 'Bo', 'Brown', false],
		['cy', 'Cy', 'Absent', true],
		['di', 'Di', 'Unmarked', false],
		['ed', 'Ed', 'Over', false],
		['fay', 'Fay', 'Four', false],
		['gus', 'Gus', 'Five', false],
		['hal', 'Hal', 'Six', false],
		['ivy', 'Ivy', 'Seven', false],
		['jo', 'Jo', 'Eight', false]
	];
	const marks: Record<string, Record<string, number>> = {};
	for (const [id] of names) marks[id] = { 'entry-1': 3, 'entry-2': 2 };
	delete marks['cy'];
	marks['di'] = { 'entry-1': 1 };
	marks['ed'] = { 'entry-1': 9, 'entry-2': 1 };
	return confirmed({
		breakdown: { entries, warnings: [], aoDescriptions: {} },
		students: names.map(([id, first, last, absent]) => student(id, first, last, absent)),
		marks,
		...over
	});
}
/**
 * Synthetic H556 variant of the 13OA class: the same marks with hand-assigned
 * 5.1.x / 5.2.x specification points — one comma-list entry counting toward
 * two codes, one slash-list entry, and entries with none (AO only).
 */
export function h556(): MarksheetDocument {
	const doc = plain();
	doc.breakdown.entries = [
		entry('entry-1', '1', '1', {
			marks: 4,
			summary: 'Define the kinetic model',
			specPoint: '5.1.1, 5.1.2',
			commandWord: null,
			ao: 'AO1'
		}),
		entry('entry-2', '2a', '2', {
			marks: 6,
			summary: 'Explain gas pressure',
			specPoint: '5.1.2/5.2.1',
			commandWord: null,
			ao: 'AO2'
		}),
		entry('entry-3', '2b', '2', {
			marks: 2,
			summary: 'Show working clearly',
			specPoint: null,
			commandWord: null,
			ao: 'AO3'
		})
	];
	for (const marks of Object.values(doc.marks)) {
		marks['entry-3'] = 2;
	}
	doc.marks['di'] = { 'entry-1': 1, 'entry-3': 1 };
	doc.marks['ed'] = { 'entry-1': 9, 'entry-2': 1, 'entry-3': 0 };
	doc.topicNames = {};
	return doc;
}

export type Canned = (
	n: number,
	init?: { signal?: AbortSignal | null }
) => Response | Promise<Response>;

export function stubFetch(canned: Canned = () => ok()) {
	let inFlight = 0;
	let peak = 0;
	let n = 0;
	const stub = vi.fn(
		async (url: string | URL | Request, init?: { signal?: AbortSignal | null }) => {
			if (String(url) === '/api/models') return Response.json({ models: [] });
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 20));
			inFlight -= 1;
			if (init?.signal?.aborted) throw new DOMException('The run was stopped.', 'AbortError');
			return canned(n++, init);
		}
	);
	vi.stubGlobal('fetch', stub);
	return { stub, peak: () => peak };
}

/** The report calls only: everything but the model-list lookup the page makes on arrival. */
export function reportCalls(stub: { mock: { calls: unknown[][] } }): number {
	return stub.mock.calls.filter(([url]) => String(url) !== '/api/models').length;
}

/** Fresh flows start at the Grades step: skip it (or Next, when grades are saved) to reach Who gets one. */
export async function skipGrades(): Promise<void> {
	await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();
	await page.getByRole('button', { name: /^(Skip|Next)/ }).click();
}

/** One eligible student and one absent: every report call belongs to Ada. */
export function solo(): MarksheetDocument {
	const fitting = plain();
	return {
		...fitting,
		students: [student('ada', 'Ada', 'Lovelace'), student('cy', 'Cy', 'Absent', true)],
		marks: { ada: fitting.marks['ada'] }
	};
}

export function retryable(message = 'The model provider is busy.'): Response {
	return Response.json(
		{ error: { code: 'MODEL_RETRYABLE', message, retryable: true } },
		{ status: 502 }
	);
}

export function hasButton(name: string): boolean {
	return [...document.querySelectorAll('button')].some(
		(button) => button.textContent?.trim() === name
	);
}

export function readyTiles(): number {
	return [...document.querySelectorAll('[data-tile-for]')].filter((tile) =>
		tile.textContent?.includes('Ready')
	).length;
}

export function failedTiles(): Element[] {
	return [...document.querySelectorAll('[data-tile-for]')].filter(
		(tile) => tile.querySelector('.text-muted-foreground')?.textContent === 'Failed'
	);
}

export function ok(strength = 'Careful working'): Response {
	return Response.json({
		strengths: [strength],
		areasForImprovement: ['Check units'],
		model: 'test/model',
		usage: {}
	});
}
export function topicNames(names: Record<string, string> = {}): Response {
	const entries = {
		'5.1.1': 'Kinetic theory of gases',
		'5.1.2': 'Gas pressure and temperature',
		'5.2.1': 'Internal energy stores',
		...names
	};
	return Response.json({ names: entries, model: 'test/model', usage: {} });
}

/** A stored report for each id, written from the document as it stands. */
export function writeFor(
	doc: MarksheetDocument,
	ids: string[],
	prose?: Partial<{ strengths: string[]; areasForImprovement: string[] }>
): void {
	doc.reports = {};
	for (const id of ids) {
		const input = generationInputFor(doc, id);
		if (!input) throw new Error(`no input for ${id}`);
		doc.reports[id] = {
			strengths: prose?.strengths ?? ['Careful working'],
			areasForImprovement: prose?.areasForImprovement ?? ['Check units'],
			edit: null,
			input,
			model: 'test/model',
			generatedAt: '2026-01-01T10:00:00.000Z'
		};
	}
}

export const posted = (stub: { mock: { calls: unknown[][] } }) =>
	stub.mock.calls
		.filter(([url]) => String(url) === '/api/report')
		.map(([, init]) => JSON.parse((init as { body: string }).body));
