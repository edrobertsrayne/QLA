// PROTOTYPE (#115) — real CSV/PDF downloads of the stubbed figures, so the files can be judged.
import { saveBlob, saveFile } from '$lib/marksheet/download.js';
import { documentPrinter, fetchPdf, toastPdfFailure } from '$lib/print-pdf.js';
import { toCsvText } from './stub.svelte.js';

export function downloadCsv(rows: string[][], filename: string): void {
	saveFile({ filename, text: toCsvText(rows), type: 'text/csv' });
}

/** The element as the PDF the server renders, like today's analysis PDF. */
export async function downloadPdf(element: HTMLElement, filename: string): Promise<void> {
	await toastPdfFailure(async () => {
		const html = (await documentPrinter('@page { size: A4; margin: 12mm; }'))(element);
		saveBlob(filename, await fetchPdf(html));
	});
}
