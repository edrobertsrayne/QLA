import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import { STORAGE_KEY } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { readSeeded } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import Page from './+page.svelte';

const USAGE = { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 };

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function apiError(code: string, message: string, retryable: boolean, status = 500): Response {
	return json({ error: { code, message, retryable } }, status);
}

function question(id: string, marks = 2): Record<string, unknown> {
	return {
		id,
		questionNumber: id.replace(/[a-z]+$/i, ''),
		marks,
		summary: `Summarise ${id}`,
		specPoint: null,
		commandWord: 'Explain',
		ao: 'AO1'
	};
}

function parseBody(tierName: string | null, questions: Record<string, unknown>[]): unknown {
	return {
		breakdown: { tierName, questions, aoDescriptions: [] },
		warnings: [],
		usage: USAGE
	};
}

function pdfFile(name: string): File {
	return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], name, {
		type: 'application/pdf'
	});
}

function fileIn(form: FormData, field: string): File {
	const value = form.get(field);
	if (!(value instanceof File)) throw new Error(`${field} is not a file.`);
	return value;
}

function formFor(calls: FormData[], filename: string): FormData {
	const form = calls.find((call) => fileIn(call, 'assessmentPaper').name === filename);
	if (form === undefined) throw new Error(`no parse call for ${filename}`);
	return form;
}

function idOf(document: MarksheetDocument, tier: 0 | 1, label: string): string {
	const entry = document.tiers[tier].breakdown.entries.find(
		(candidate) => candidate.label === label
	);
	if (entry === undefined) throw new Error(`no entry labelled ${label} on tier ${tier}`);
	return entry.id;
}

interface Api {
	parseCalls: FormData[];
	matchCalls: FormData[];
}

function stubApi(handlers: {
	parse: (form: FormData, call: number) => Response | Promise<Response>;
	match?: (form: FormData, call: number) => Response | Promise<Response>;
}): Api {
	const parseCalls: FormData[] = [];
	const matchCalls: FormData[] = [];
	const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url =
			typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (url.includes('/api/models'))
			return json({ models: [{ id: 'vendor/model', name: 'Vendor model' }] });
		if (url.includes('/api/parse')) {
			if (!(init?.body instanceof FormData)) throw new Error('parse called without a form');
			parseCalls.push(init.body);
			return handlers.parse(init.body, parseCalls.length);
		}
		if (url.includes('/api/match')) {
			if (!(init?.body instanceof FormData)) throw new Error('match called without a form');
			matchCalls.push(init.body);
			return handlers.match
				? handlers.match(init.body, matchCalls.length)
				: json({ pairs: [], usage: USAGE });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { parseCalls, matchCalls };
}

async function uploadPaper(name: string): Promise<void> {
	await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile(name));
}

async function uploadMarkscheme(name: string): Promise<void> {
	await page.getByLabelText('Markscheme (PDF)').upload(pdfFile(name));
}

async function addTierWithPaper(name: string): Promise<void> {
	await page.getByRole('button', { name: 'Add tier' }).click();
	await uploadPaper(name);
}

/** The source card's tier control, scoped so "Retry Tier 1" and "Remove Tier 2" never match. */
function sourceTier(name: RegExp) {
	return page.getByRole('group', { name: 'Tier' }).getByRole('button', { name });
}

describe('upload page run', () => {
	beforeEach(() => {
		stubApi({ parse: () => json(parseBody(null, [question('1a')])) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('links a picker problem to its file input', async () => {
		render(Page);
		const input = page.getByLabelText('Assessment paper (PDF)');
		await input.upload(new File(['not a pdf'], 'notes.txt', { type: 'text/plain' }));

		const describedBy = input.element().getAttribute('aria-describedby');
		expect(describedBy).toBe('paper-0-problem');
		expect(document.getElementById(describedBy ?? '')?.textContent).toContain(
			'Only PDF files are accepted.'
		);
	});

	it('keeps the open source tier selected when its tab is clicked again', async () => {
		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');

		const tab = sourceTier(/^Tier 2/);
		await expect.element(tab).toHaveAttribute('aria-pressed', 'true');
		await tab.click();

		await expect.element(tab).toHaveAttribute('aria-pressed', 'true');
	});

	it('runs one tier, offering Open breakdown before anything is stored', async () => {
		stubApi({ parse: () => json(parseBody('Higher Tier', [question('1a')])) });

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		await expect.element(page.getByText('Parse', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Higher Tier · 1 entry')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Open breakdown' })).toBeVisible();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

		await page.getByRole('button', { name: 'Open breakdown' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.schemaVersion).toBe(3);
		expect(stored.tiers).toHaveLength(1);
		expect(stored.tiers[0].tierName).toBe('Higher Tier');
		expect(stored.tiers[0].sourceFilenames).toEqual(['higher.pdf']);
		expect(stored.label).toBe('higher');
		expect(stored.tiers[0].breakdown.entries.map((entry) => entry.label)).toEqual(['1a']);
		expect(stored.commonQuestions).toEqual([]);
		expect(marksheetStore().runUsage?.totalTokens).toBe(30);
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('adds a second tier and removes it again before Run', async () => {
		render(Page);
		await uploadPaper('higher.pdf');

		await expect.element(page.getByRole('button', { name: 'Add tier' })).toBeVisible();
		await page.getByRole('button', { name: 'Add tier' }).click();

		await expect.element(sourceTier(/^Tier 1/)).toBeVisible();
		await expect.element(sourceTier(/^Tier 2/)).toBeVisible();
		expect(page.getByLabelText('Assessment paper (PDF)').elements()).toHaveLength(1);
		expect(page.getByLabelText('Markscheme (PDF)').elements()).toHaveLength(1);
		await expect.element(page.getByText(/Used for both tiers/)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Remove Tier 2' })).toBeVisible();

		await page.getByRole('button', { name: 'Remove Tier 2' }).click();

		await expect.element(sourceTier(/^Tier 2/)).not.toBeInTheDocument();
		await expect.element(page.getByText('higher.pdf')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add tier' })).toBeVisible();
	});

	it('names the input a tier lacks and blocks Run until both tiers match', async () => {
		render(Page);
		await uploadPaper('higher.pdf');
		await uploadMarkscheme('higher-ms.pdf');
		await addTierWithPaper('foundation.pdf');

		await expect
			.element(page.getByText('Tier 1 has a markscheme, so Tier 2 needs one too.'))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeDisabled();
		await expect.element(page.getByTestId('tier-problem-1')).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Markscheme (PDF)'))
			.toHaveAttribute('aria-invalid', 'true');
		await expect
			.element(page.getByLabelText('Assessment paper (PDF)'))
			.not.toHaveAttribute('aria-invalid', 'true');

		await uploadMarkscheme('foundation-ms.pdf');

		await expect.element(page.getByText(/Tier 1 has a markscheme/)).not.toBeInTheDocument();
		await expect.element(page.getByTestId('tier-problem-1')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeEnabled();
	});

	it('parses both tiers, matches their labels and stores the proposed pairs', async () => {
		const api = stubApi({
			parse: (form) => {
				const paper = fileIn(form, 'assessmentPaper').name;
				return paper === 'higher.pdf'
					? json(parseBody('Higher', [question('1a'), question('2b', 3)]))
					: json(parseBody('Foundation', [question('8a'), question('9b', 3)]));
			},
			match: () => json({ pairs: [{ tier1Id: '1a', tier2Id: '8a' }], usage: USAGE })
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await uploadMarkscheme('higher-ms.pdf');
		await addTierWithPaper('foundation.pdf');
		await uploadMarkscheme('foundation-ms.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByText('Parse Tier 1')).toBeInTheDocument();
		await expect.element(page.getByText('Parse Tier 2')).toBeInTheDocument();
		await expect.element(page.getByText('Find common questions')).toBeInTheDocument();
		await expect.element(page.getByText('Higher · 2 entries')).toBeInTheDocument();
		await expect.element(page.getByText('Foundation · 2 entries')).toBeInTheDocument();
		await expect.element(page.getByText('1 pair proposed')).toBeInTheDocument();
		await expect.element(sourceTier(/^Tier 1 · Higher/)).toBeInTheDocument();
		await expect.element(sourceTier(/^Tier 2 · Foundation/)).toBeInTheDocument();

		// Each parse is its own call with only that tier's files: the caps are per call.
		expect(api.parseCalls).toHaveLength(2);
		const higherForm = formFor(api.parseCalls, 'higher.pdf');
		const foundationForm = formFor(api.parseCalls, 'foundation.pdf');
		expect(fileIn(higherForm, 'markscheme').name).toBe('higher-ms.pdf');
		expect(fileIn(foundationForm, 'markscheme').name).toBe('foundation-ms.pdf');

		// One matching call, with the assessment paper when present and parse labels as entries.
		expect(api.matchCalls).toHaveLength(1);
		const matchForm = api.matchCalls[0];
		expect(fileIn(matchForm, 'tier1Document').name).toBe('higher.pdf');
		expect(fileIn(matchForm, 'tier2Document').name).toBe('foundation.pdf');
		expect(JSON.parse(String(matchForm.get('tier1Entries')))).toEqual([
			{
				id: '1a',
				questionNumber: '1',
				marks: 2,
				summary: 'Summarise 1a',
				specPoint: null,
				commandWord: 'Explain'
			},
			{
				id: '2b',
				questionNumber: '2',
				marks: 3,
				summary: 'Summarise 2b',
				specPoint: null,
				commandWord: 'Explain'
			}
		]);
		expect(matchForm.get('model')).toBeNull();

		await page.getByRole('button', { name: 'Open breakdown' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.tiers.map((tier) => tier.tierName)).toEqual(['Higher', 'Foundation']);
		expect(stored.tiers[0].sourceFilenames).toEqual(['higher.pdf', 'higher-ms.pdf']);
		expect(stored.tiers[1].sourceFilenames).toEqual(['foundation.pdf', 'foundation-ms.pdf']);
		expect(stored.commonQuestions).toEqual([
			{ tier1EntryId: idOf(stored, 0, '1a'), tier2EntryId: idOf(stored, 1, '8a') }
		]);
		expect(marksheetStore().runUsage?.totalTokens).toBe(90);
	});

	it('sends the matcher only fields its route accepts', async () => {
		const api = stubApi({
			parse: (form) => {
				const paper = fileIn(form, 'assessmentPaper').name;
				return paper === 'higher.pdf'
					? json(
							parseBody('Higher', [
								{ ...question('1a', 0), summary: 'x'.repeat(400) },
								{ ...question('2b'), id: 'y'.repeat(130) }
							])
						)
					: json(parseBody('Foundation', [question('8a')]));
			},
			match: () => json({ pairs: [], usage: USAGE })
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByText(/0 pairs proposed/)).toBeInTheDocument();
		const entries = JSON.parse(String(api.matchCalls[0].get('tier1Entries'))) as {
			id: string;
			marks: number | null;
			summary: string;
		}[];
		// A warned 0 mark cannot be a pair, but it must not lose the whole call;
		// a summary over the route's cap is cut to it; an unnameable label is left out.
		expect(entries.map((entry) => entry.id)).toEqual(['1a']);
		expect(entries[0].marks).toBeNull();
		expect(entries[0].summary).toHaveLength(300);
	});

	it('matches with the markscheme when no paper is attached, using the shared model', async () => {
		const api = stubApi({
			parse: (form) =>
				fileIn(form, 'markscheme').name === 'higher-ms.pdf'
					? json(parseBody('Higher', [question('1a')]))
					: json(parseBody('Foundation', [question('8a')])),
			match: () => json({ pairs: [{ tier1Id: '1a', tier2Id: '8a' }], usage: USAGE })
		});

		render(Page);
		await uploadMarkscheme('higher-ms.pdf');
		await page.getByRole('button', { name: 'Add tier' }).click();
		await uploadMarkscheme('foundation-ms.pdf');

		await page.getByRole('combobox', { name: 'Model override' }).click();
		await page.getByRole('option', { name: /Vendor model/ }).click();

		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByText('1 pair proposed')).toBeInTheDocument();
		expect(api.parseCalls).toHaveLength(2);
		for (const form of api.parseCalls) {
			expect(form.get('assessmentPaper')).toBeNull();
			expect(form.get('modelOverride')).toBe('vendor/model');
		}
		const matchForm = api.matchCalls[0];
		expect(fileIn(matchForm, 'tier1Document').name).toBe('higher-ms.pdf');
		expect(fileIn(matchForm, 'tier2Document').name).toBe('foundation-ms.pdf');
		expect(matchForm.get('model')).toBe('vendor/model');

		await page.getByRole('button', { name: 'Open breakdown' }).click();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.commonQuestions).toEqual([
			{ tier1EntryId: idOf(stored, 0, '1a'), tier2EntryId: idOf(stored, 1, '8a') }
		]);
	});

	it('retries a temporary parse failure in silence and keeps the other tier’s parse', async () => {
		let foundationCalls = 0;
		const api = stubApi({
			parse: (form) => {
				if (fileIn(form, 'assessmentPaper').name === 'foundation.pdf') {
					foundationCalls += 1;
					if (foundationCalls === 1) {
						return apiError('MODEL_RETRYABLE', 'Provider busy', true, 502);
					}
					return json(parseBody('Foundation', [question('8a')]));
				}
				return json(parseBody('Higher', [question('1a')]));
			},
			match: () => json({ pairs: [], usage: USAGE })
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		// The first failure never reaches the teacher: the run retries it once
		// and finishes with both tiers parsed.
		await expect.element(page.getByText('Foundation · 1 entry')).toBeInTheDocument();
		await expect.element(page.getByText('Higher · 1 entry')).toBeInTheDocument();
		await expect.element(page.getByText('0 pairs proposed')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Retry Tier 2' }))
			.not.toBeInTheDocument();
		expect(
			api.parseCalls.filter((form) => fileIn(form, 'assessmentPaper').name === 'higher.pdf')
		).toHaveLength(1);
		expect(
			api.parseCalls.filter((form) => fileIn(form, 'assessmentPaper').name === 'foundation.pdf')
		).toHaveLength(2);
	});

	it('replaces a bad file, keeps the other parse and retries only that tier from the page', async () => {
		const api = stubApi({
			parse: (form) => {
				const paper = fileIn(form, 'assessmentPaper').name;
				if (paper === 'higher.pdf') {
					return apiError('PDF_UNREADABLE', 'The paper could not be read.', false, 400);
				}
				if (paper === 'higher-fixed.pdf') return json(parseBody('Higher', [question('1a')]));
				return json(parseBody('Foundation', [question('8a')]));
			},
			match: () => json({ pairs: [{ tier1Id: '1a', tier2Id: '8a' }], usage: USAGE })
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByRole('button', { name: "Replace Tier 1's file" })).toBeVisible();
		await page.getByRole('button', { name: "Replace Tier 1's file" }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Retry Tier 1' })).toBeVisible();
		// The reason the dialog closed with stays beside the retry.
		await expect.element(page.getByText('The paper could not be read.')).toBeVisible();
		await expect.element(sourceTier(/^Tier 1/)).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByText('higher.pdf')).toBeInTheDocument();
		// The rejected file is still in the slot, so retrying it would just fail again.
		await expect.element(page.getByRole('button', { name: 'Retry Tier 1' })).toBeDisabled();

		await uploadPaper('higher-fixed.pdf');
		await expect.element(page.getByRole('button', { name: 'Retry Tier 1' })).toBeEnabled();
		await page.getByRole('button', { name: 'Retry Tier 1' }).click();

		await expect.element(page.getByText('Foundation · 1 entry')).toBeInTheDocument();
		await expect.element(page.getByText('Higher · 1 entry')).toBeInTheDocument();
		await expect.element(page.getByText('1 pair proposed')).toBeInTheDocument();
		expect(
			api.parseCalls.filter((form) => fileIn(form, 'assessmentPaper').name === 'higher.pdf')
		).toHaveLength(1);
		expect(
			api.parseCalls.filter((form) => fileIn(form, 'assessmentPaper').name === 'foundation.pdf')
		).toHaveLength(1);
		expect(
			api.parseCalls.filter((form) => fileIn(form, 'assessmentPaper').name === 'higher-fixed.pdf')
		).toHaveLength(1);

		await page.getByRole('button', { name: 'Open breakdown' }).click();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.tiers[0].sourceFilenames).toEqual(['higher-fixed.pdf']);
		expect(stored.tiers[1].sourceFilenames).toEqual(['foundation.pdf']);
	});

	it('abandons a persistent retryable failure after three silent retries, keeping the files', async () => {
		const api = stubApi({
			parse: () => apiError('MODEL_RETRYABLE', 'Provider busy', true, 502)
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
		// The first try and three retries, then the failure is the teacher's to act on.
		expect(api.parseCalls).toHaveLength(4);
		await page.getByRole('button', { name: 'Back to upload' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByText('higher.pdf')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeEnabled();
		// The form is back: the options the stopped run locked are editable again.
		await expect.element(page.getByRole('combobox', { name: 'Model override' })).toBeEnabled();
	});

	it('stops the run when the server marks a model failure non-retryable', async () => {
		const api = stubApi({
			parse: () => apiError('MODEL_ERROR', 'The model call failed.', false, 500)
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		// The server decides: MODEL_ERROR used to be guessed retryable by the
		// client, so this now fails the run instead of offering Retry.
		await expect.element(page.getByTestId('fatal-panel')).toHaveTextContent('MODEL_ERROR');
		await expect.element(page.getByText('The model call failed.')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Retry', exact: true }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Back to upload' })).toBeVisible();
		// A failure that would fail the same way again is not retried.
		expect(api.parseCalls).toHaveLength(1);
	});

	it('lets Escape abandon a stopped run', async () => {
		stubApi({ parse: () => apiError('MODEL_RETRYABLE', 'Provider busy', true, 502) });

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();
		await expect.element(page.getByRole('button', { name: 'Back to upload' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeEnabled();
	});

	it.each(['MODEL_REJECTED', 'MODEL_CREDIT'] as const)(
		'keeps both parses when matching stops the run with %s',
		async (code) => {
			const message = 'The matching call failed.';
			stubApi({
				parse: (form) =>
					fileIn(form, 'assessmentPaper').name === 'higher.pdf'
						? json(parseBody('Higher', [question('1a')]))
						: json(parseBody('Foundation', [question('8a')])),
				match: () => apiError(code, message, false, 502)
			});

			render(Page);
			await uploadPaper('higher.pdf');
			await addTierWithPaper('foundation.pdf');
			await page.getByRole('button', { name: 'Run' }).click();

			// A matching failure cannot cost a parse: both tiers are already in hand.
			await expect.element(page.getByRole('button', { name: 'Open breakdown' })).toBeVisible();
			await expect.element(page.getByText('Higher · 1 entry')).toBeInTheDocument();
			await expect.element(page.getByText('Foundation · 1 entry')).toBeInTheDocument();
			await expect
				.element(page.getByText('None proposed: pair them by hand at review'))
				.toBeVisible();
			await expect.element(page.getByText(`${message} (${code})`)).toBeVisible();
			await expect.element(page.getByTestId('fatal-panel')).not.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

			await page.getByRole('button', { name: 'Open breakdown' }).click();

			await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
			const stored = readSeeded();
			expect(stored.tiers).toHaveLength(2);
			expect(stored.commonQuestions).toEqual([]);
			expect(marksheetStore().matchNotice).toBe(message);
			// Both parses are kept, and the failed match added no usage.
			expect(marksheetStore().runUsage?.totalTokens).toBe(60);
		}
	);

	it('stops the whole run on a run-stopping error and keeps nothing', async () => {
		stubApi({
			parse: () => apiError('MODEL_CREDIT', 'The account is out of credit.', false, 502)
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByRole('button', { name: 'Back to upload' })).toBeVisible();
		await expect.element(page.getByTestId('fatal-panel')).toHaveTextContent('MODEL_CREDIT');
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

		await page.getByRole('button', { name: 'Back to upload' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('fatal-panel')).toHaveTextContent('MODEL_CREDIT');
		expect(marksheetStore().document).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('retries a temporary matching failure once in silence, then offers Try again', async () => {
		const api = stubApi({
			parse: (form) =>
				fileIn(form, 'assessmentPaper').name === 'higher.pdf'
					? json(parseBody('Higher', [question('1a')]))
					: json(parseBody(null, [question('8a')])),
			match: (_form, call) =>
				call <= 2
					? apiError('MODEL_RETRYABLE', 'Matching is busy', true, 502)
					: json({ pairs: [{ tier1Id: '1a', tier2Id: '8a' }], usage: USAGE })
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Back to upload' })).toBeVisible();
		await expect.element(page.getByText('No tier printed · 1 entry')).toBeInTheDocument();
		await expect.element(page.getByText('Matching is busy (MODEL_RETRYABLE)')).toBeInTheDocument();
		// One silent retry: the failed first attempt never surfaced as an action.
		expect(api.matchCalls).toHaveLength(2);

		await page.getByRole('button', { name: 'Try again' }).click();

		await expect.element(page.getByText('1 pair proposed')).toBeInTheDocument();
		expect(api.matchCalls).toHaveLength(3);
		expect(
			api.parseCalls.filter((form) => fileIn(form, 'assessmentPaper').name === 'higher.pdf')
		).toHaveLength(1);

		await page.getByRole('button', { name: 'Open breakdown' }).click();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.commonQuestions).toEqual([
			{ tier1EntryId: idOf(stored, 0, '1a'), tier2EntryId: idOf(stored, 1, '8a') }
		]);
	});

	it('continues without proposed pairs and keeps the matching reason for review', async () => {
		stubApi({
			parse: (form) =>
				fileIn(form, 'assessmentPaper').name === 'higher.pdf'
					? json(parseBody('Higher', [question('1a')]))
					: json(parseBody('Foundation', [question('8a')])),
			match: () =>
				apiError(
					'INVALID_MODEL_OUTPUT',
					'The model answer was not a usable list of common-question pairs.',
					true,
					502
				)
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await page.getByRole('button', { name: 'Continue without proposed pairs' }).click();
		await expect.element(page.getByText('Skipped: pair them by hand at review')).toBeVisible();
		await page.getByRole('button', { name: 'Open breakdown' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.commonQuestions).toEqual([]);
		expect(marksheetStore().matchNotice).toBe(
			'The model answer was not a usable list of common-question pairs.'
		);
	});

	it('finishes a non-retryable matching failure with no pairs and the notice', async () => {
		stubApi({
			parse: (form) =>
				fileIn(form, 'assessmentPaper').name === 'higher.pdf'
					? json(parseBody('Higher', [question('1a')]))
					: json(parseBody('Foundation', [question('8a')])),
			match: () =>
				apiError(
					'MATCH_NEEDS_NATIVE_PDF',
					'The chosen model cannot read PDFs natively.',
					false,
					400
				)
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect
			.element(page.getByText('None proposed: pair them by hand at review'))
			.toBeVisible();
		await expect
			.element(
				page.getByText('The chosen model cannot read PDFs natively. (MATCH_NEEDS_NATIVE_PDF)')
			)
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Open breakdown' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		const stored = readSeeded();
		expect(stored.tiers).toHaveLength(2);
		expect(stored.commonQuestions).toEqual([]);
		expect(marksheetStore().matchNotice).toBe('The chosen model cannot read PDFs natively.');
	});

	it('says a two-tier run can take a few minutes while parsing and while matching', async () => {
		interface PendingParse {
			promise: Promise<Response>;
			resolve: (response: Response) => void;
		}
		const parses: PendingParse[] = [];
		const matching = Promise.withResolvers<Response>();
		stubApi({
			parse: () => {
				const pending = Promise.withResolvers<Response>();
				parses.push(pending);
				return pending.promise;
			},
			match: () => matching.promise
		});

		render(Page);
		await uploadPaper('higher.pdf');
		await addTierWithPaper('foundation.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		const description = page.getByText(
			'Each tier is parsed on its own, then the two are compared. This can take a few minutes.'
		);
		await expect.element(description).toBeVisible();

		// Each call gets its own response: a Response body is read once.
		await vi.waitFor(() => expect(parses).toHaveLength(2));
		for (const pending of parses) pending.resolve(json(parseBody('Higher', [question('1a')])));
		await expect.element(page.getByText('Find common questions')).toBeInTheDocument();
		// Matching is the same wait, and says so too.
		await expect.element(description).toBeVisible();

		matching.resolve(json({ pairs: [], usage: USAGE }));
		await expect.element(page.getByRole('button', { name: 'Open breakdown' })).toBeVisible();
		await expect
			.element(
				page.getByText('Each tier is parsed on its own, then the two are compared.', {
					exact: true
				})
			)
			.toBeVisible();
	});

	it('cannot be dismissed by Escape, says the wait, and locks the files while it runs', async () => {
		const { promise: pending, resolve: release } = Promise.withResolvers<Response>();
		stubApi({ parse: () => pending });

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();

		await expect.element(page.getByRole('dialog')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Close' })).not.toBeInTheDocument();
		await expect.element(page.getByLabelText('Assessment paper (PDF)')).toBeDisabled();
		await expect.element(page.getByLabelText('Markscheme (PDF)')).toBeDisabled();
		await expect.element(page.getByText('Running…')).toBeVisible();
		await expect
			.element(page.getByText('The paper is parsed into a breakdown. This can take a few minutes.'))
			.toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).toBeVisible();
		await expect.element(page.getByText('Running…')).toBeVisible();

		release(json(parseBody('Higher', [question('1a')])));
		await expect.element(page.getByRole('button', { name: 'Open breakdown' })).toBeVisible();
		// The wait is only worth saying while there is one.
		await expect
			.element(page.getByText('The paper is parsed into a breakdown.', { exact: true }))
			.toBeVisible();
	});

	it('cancels a run in flight, keeping the files and storing nothing', async () => {
		const { promise: pending, resolve: release } = Promise.withResolvers<Response>();
		const api = stubApi({ parse: () => pending });

		render(Page);
		await uploadPaper('higher.pdf');
		await page.getByRole('button', { name: 'Run' }).click();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByText('higher.pdf')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeEnabled();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(marksheetStore().document).toBeNull();

		// The request had already left: its answer is dropped rather than stored.
		release(json(parseBody('Higher', [question('1a')])));
		await vi.waitFor(() => expect(api.parseCalls).toHaveLength(1));
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeEnabled();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(marksheetStore().document).toBeNull();
	});
});
