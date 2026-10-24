// The analysis as a PDF file: the view as the page shows it, sent to the
// server to be rendered.

import { analysisPdfFilename, saveBlob } from '$lib/marksheet/download.js';
import type { MarksheetDocument, TierIndex } from '$lib/marksheet/document.js';
import { fetchPdf, documentPrinter } from '$lib/print-pdf.js';

/**
 * Render `view` and save the file under the open tab's name: the tier's slug,
 * or the common-questions name. Each section keeps its band in its heading, so
 * a greyscale copy still reads. The paper margin is the analysis's own: unlike
 * a report it has no page of its own to fill.
 */
export async function downloadAnalysisPdf(
	view: HTMLElement,
	document: MarksheetDocument,
	tab: TierIndex | 'common',
	now: Date
): Promise<void> {
	const html = (await documentPrinter('@page { size: A4; margin: 12mm; }'))(view);
	saveBlob(analysisPdfFilename(document, tab, now), await fetchPdf(html));
}
