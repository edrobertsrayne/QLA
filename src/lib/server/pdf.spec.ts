// The render deadline: whichever step of a render hangs, its slot is released
// at the deadline and a later render can launch a fresh browser.

import type { Browser } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	closePdfBrowser,
	MAX_CONCURRENT_PDF_RENDERS,
	PDF_RENDER_TIMEOUT_MS,
	PdfBusyError,
	PdfTimeoutError,
	renderPdf,
	resetBrowserLauncher,
	setBrowserLauncher
} from './pdf';

const never = new Promise<never>(() => {});

/** A browser whose context steps are the ones given; the rest succeed. */
function fakeBrowser(
	context: { close?: () => Promise<void>; newContext?: () => Promise<unknown> } = {}
) {
	const close = vi.fn(async () => {});
	const page = {
		setContent: async () => {},
		pdf: async () => Buffer.from('%PDF')
	};
	const browser = {
		on: () => {},
		close,
		newContext:
			context.newContext ??
			(async () => ({
				route: async () => {},
				newPage: async () => page,
				close: context.close ?? (async () => {})
			}))
	};
	return { browser: browser as unknown as Browser, close };
}

/** Run a render to its deadline and return how it ended. */
async function renderToDeadline(): Promise<unknown> {
	const outcome = renderPdf('<p>x</p>').then(
		() => 'rendered',
		(error: unknown) => error
	);
	await vi.advanceTimersByTimeAsync(PDF_RENDER_TIMEOUT_MS);
	return outcome;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(async () => {
	await closePdfBrowser();
	vi.useRealTimers();
	resetBrowserLauncher();
});

describe('renderPdf deadline', () => {
	it('abandons a launch that never settles, frees the slot and launches afresh next time', async () => {
		const launch = vi.fn<() => Promise<Browser>>(() => never);
		setBrowserLauncher(launch);

		expect(await renderToDeadline()).toBeInstanceOf(PdfTimeoutError);

		const fresh = fakeBrowser();
		launch.mockImplementation(async () => fresh.browser);
		expect(await renderPdf('<p>x</p>')).toEqual(Buffer.from('%PDF'));
		expect(launch).toHaveBeenCalledTimes(2);
	});

	it('closes the browser it drops when the launch settles late', async () => {
		let launched!: (browser: Browser) => void;
		setBrowserLauncher(() => new Promise<Browser>((resolve) => (launched = resolve)));
		await renderToDeadline();

		const late = fakeBrowser();
		launched(late.browser);
		await vi.advanceTimersByTimeAsync(0);

		expect(late.close).toHaveBeenCalled();
	});

	it.each([
		['newContext', { newContext: () => never }],
		['context.close', { close: () => never }]
	] as const)('releases the slot when %s never settles', async (_step, hang) => {
		setBrowserLauncher(async () => fakeBrowser(hang).browser);

		expect(await renderToDeadline()).toBeInstanceOf(PdfTimeoutError);
	});

	it('does not answer busy after hung renders have passed their deadlines', async () => {
		setBrowserLauncher(() => never);
		const hung = Array.from({ length: MAX_CONCURRENT_PDF_RENDERS }, () =>
			renderPdf('<p>x</p>').catch((error: unknown) => error)
		);
		await expect(renderPdf('<p>x</p>')).rejects.toBeInstanceOf(PdfBusyError);

		await vi.advanceTimersByTimeAsync(PDF_RENDER_TIMEOUT_MS);
		expect(await Promise.all(hung)).toEqual(hung.map(() => expect.any(PdfTimeoutError)));

		setBrowserLauncher(async () => fakeBrowser().browser);
		await expect(renderPdf('<p>x</p>')).resolves.toBeInstanceOf(Buffer);
	});
});
