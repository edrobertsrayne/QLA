// The analysis as a PDF file: the view as the page shows it, sent to the
// server to be rendered.

import { analysisPdfFilename, saveBlob } from '$lib/marksheet/download.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { fetchPdf, printDocumentHtml } from '$lib/print-pdf.js';

/**
 * Render `view` and save the file. `unfold` opens everything the view folds
 * away and resolves, once the page shows it, with a function that folds it
 * back; that runs as soon as the markup is captured, so the screen is not
 * left changed while the server renders. Each section keeps its band in its
 * heading, so a greyscale copy still reads. The paper margin is the
 * analysis's own: unlike a report it has no page of its own to fill.
 */
export async function downloadAnalysisPdf(
	view: HTMLElement,
	document: MarksheetDocument,
	now: Date,
	unfold: () => Promise<() => void>
): Promise<void> {
	const restore = await unfold();
	let html: string;
	try {
		html = await printDocumentHtml(view, '@page { size: A4; margin: 12mm; }');
	} finally {
		restore();
	}
	saveBlob(analysisPdfFilename(document, now), await fetchPdf(html));
}
