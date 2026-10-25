// Print-ready HTML to a PDF, rendered by one shared headless Chromium.
//
// The HTML comes from the browser (what Print would print, with its CSS) and
// is untrusted: Chromium runs with JavaScript off and every request blocked,
// so nothing in the payload can reach the network or the host. The browser is
// launched once and reused; each render gets its own throwaway context, so no
// state crosses from one request to the next. HTML and PDFs are never logged.

import { chromium, type Browser } from 'playwright';

/** The largest HTML body the PDF route reads: a whole class of reports is well under it. */
export const MAX_PDF_HTML_BYTES = 8 * 1024 * 1024;

/** A PDF render, from taking a slot to releasing it, may take this long before it is abandoned. */
export const PDF_RENDER_TIMEOUT_MS = 30_000;

/** At most this many renders run at once; each holds a browser context and a copy of the HTML. */
export const MAX_CONCURRENT_PDF_RENDERS = 2;

/** Every render slot is taken; the caller may try again shortly. */
export class PdfBusyError extends Error {
	constructor() {
		super('The server is busy making PDFs. Try again in a moment.');
	}
}

let activeRenders = 0;

/** The render was abandoned at the deadline. */
export class PdfTimeoutError extends Error {
	constructor() {
		super('The PDF took too long to render.');
	}
}

let browser: Promise<Browser> | null = null;

let launchBrowser: () => Promise<Browser> = () => chromium.launch();

/** Replace the browser launcher, so a spec can hang or fail a launch. */
export function setBrowserLauncher(launcher: () => Promise<Browser>): void {
	launchBrowser = launcher;
}

export function resetBrowserLauncher(): void {
	launchBrowser = () => chromium.launch();
}

/** The shared browser, launched on first use and again if it has gone away. */
function sharedBrowser(): Promise<Browser> {
	if (browser) return browser;
	const launched = launchBrowser();
	browser = launched;
	launched.then(
		(instance) =>
			instance.on('disconnected', () => {
				if (browser === launched) browser = null;
			}),
		() => {
			if (browser === launched) browser = null;
		}
	);
	return launched;
}

/** Forget the shared browser, so the next render launches a fresh one, and close it best-effort. */
function dropSharedBrowser(): void {
	const dropped = browser;
	browser = null;
	dropped?.then((instance) => instance.close()).catch(() => {});
}

/** Close the shared browser, so a process or a spec can exit cleanly. */
export async function closePdfBrowser(): Promise<void> {
	const closing = browser;
	browser = null;
	if (closing) await (await closing).close();
}

/**
 * One PDF of `html`: the page size the document asks for, A4 when it asks for
 * none. Everything from taking a slot to releasing it runs under one deadline,
 * so a hung launch, context or close cannot hold the slot. At the deadline the
 * render's cleanup carries on in the background.
 */
export async function renderPdf(html: string): Promise<Buffer> {
	if (activeRenders >= MAX_CONCURRENT_PDF_RENDERS) throw new PdfBusyError();
	activeRenders++;
	const progress = { drawing: false };
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			// A hang outside drawing means the browser itself is not answering. A slow
			// page leaves the browser, and any other render using it, alone.
			if (!progress.drawing) dropSharedBrowser();
			reject(new PdfTimeoutError());
		}, PDF_RENDER_TIMEOUT_MS);
	});
	try {
		return await Promise.race([render(html, progress), deadline]);
	} finally {
		clearTimeout(timer);
		activeRenders--;
	}
}

async function render(html: string, progress: { drawing: boolean }): Promise<Buffer> {
	const context = await (
		await sharedBrowser()
	).newContext({ javaScriptEnabled: false, offline: true, serviceWorkers: 'block' });
	try {
		// Offline already refuses the network; routing makes the refusal explicit.
		await context.route('**/*', (route) => route.abort());
		const page = await context.newPage();
		progress.drawing = true;
		await page.setContent(html);
		const pdf = await page.pdf({ preferCSSPageSize: true, format: 'A4', printBackground: true });
		progress.drawing = false;
		return pdf;
	} finally {
		await context.close();
	}
}
