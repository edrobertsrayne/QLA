// Turning what Print would print into a PDF file.
//
// The PDF is rendered on the server from the same markup and CSS Print uses,
// so no layout exists twice. What leaves the browser is one self-contained
// HTML document: the printed elements, every stylesheet of the page, and the
// fonts the page actually loaded as data URLs, because the server renders with
// the network off and could not fetch them.

import { ApiFailure, failureFrom } from './api-error.js';
import { toast } from 'svelte-sonner';

const PDF_FAILED = 'The PDF could not be made.';

/** A font family as the CSS and the FontFace API each spell it: unquoted, to compare. */
function unquoted(family: string): string {
	return family.replace(/^["']|["']$/g, '');
}

/** Whether the page loaded this `@font-face`, rather than merely declaring it. */
function isLoaded(rule: CSSFontFaceRule): boolean {
	return [...document.fonts].some(
		(face) =>
			face.status === 'loaded' &&
			unquoted(face.family) === unquoted(rule.style.getPropertyValue('font-family')) &&
			face.weight === (rule.style.getPropertyValue('font-weight') || 'normal') &&
			face.unicodeRange === (rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF')
	);
}

async function dataUrl(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) throw new ApiFailure(PDF_FAILED);
	const bytes = new Uint8Array(await response.arrayBuffer());
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:${response.headers.get('content-type') ?? 'font/woff2'};base64,${btoa(binary)}`;
}

/** A loaded `@font-face` with its files inlined, or nothing for one the page never used. */
async function inlinedFontFace(rule: CSSFontFaceRule, base: string): Promise<string> {
	if (!isLoaded(rule)) return '';
	const urls = new Set(
		[...rule.cssText.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1])
	);
	let css = rule.cssText;
	for (const url of urls) {
		if (url.startsWith('data:')) continue;
		css = css.replaceAll(url, await dataUrl(new URL(url, base).href));
	}
	return css;
}

/** Every rule of every stylesheet of the page, as text. */
async function pageCss(): Promise<string> {
	const parts = await Promise.all(
		[...document.styleSheets].flatMap((sheet) =>
			[...sheet.cssRules].map((rule) =>
				rule instanceof CSSFontFaceRule
					? inlinedFontFace(rule, sheet.href ?? document.baseURI)
					: Promise.resolve(rule.cssText)
			)
		)
	);
	return parts.join('\n');
}

/**
 * Make the self-contained document for any body, from the page's CSS and fonts
 * read once: a download of many documents inlines the fonts once, not per
 * document. `extraCss` comes last, so it wins: a document whose own print
 * styles set no page margin asks for one here.
 */
export async function documentPrinter(extraCss = ''): Promise<(body: Element) => string> {
	const css = await pageCss();
	return (body) =>
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}\n${extraCss}</style></head><body>${body.outerHTML}</body></html>`;
}

/** The PDF the server renders for `html`; rejects with an `ApiFailure` when it cannot. */
export async function fetchPdf(html: string): Promise<Blob> {
	let response: Response;
	try {
		response = await fetch('/api/pdf', {
			method: 'POST',
			headers: { 'Content-Type': 'text/html' },
			body: html
		});
	} catch (error) {
		// A refused or dropped connection: fetch says so with a TypeError.
		if (!(error instanceof TypeError)) throw error;
		throw new ApiFailure(PDF_FAILED);
	}
	if (!response.ok) throw await failureFrom(response, PDF_FAILED);
	return response.blob();
}

/** Run a PDF download; a failure the user can act on is shown as a toast, anything else is a bug and rethrown. */
export async function toastPdfFailure(download: () => Promise<void>): Promise<void> {
	try {
		await download();
	} catch (error) {
		if (!(error instanceof ApiFailure)) throw error;
		toast.error(error.message);
	}
}
