// Report PDFs: the printed pages of the Review step, sent to the server to be
// rendered. The pages are the print copies `PrintRoot` already holds (measured
// and settled, edits included), so a PDF carries what Print would print.

import { zipSync } from 'fflate';
import {
	reportPdfFilename,
	reportsPdfFilename,
	reportsZipFilename,
	saveBlob
} from '$lib/marksheet/download.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { fetchPdf, printDocumentHtml } from '$lib/print-pdf.js';

/** What a download is of: one student's page, every visible report as one PDF, or one PDF each in a zip. */
export type ReportDownload = 'page' | 'one' | 'zip';

/** A copy of the print root holding only the pages of `ids`, in that order. */
function rootOf(printRoot: HTMLElement, ids: string[]): HTMLElement {
	const copy = printRoot.cloneNode(false) as HTMLElement;
	for (const id of ids) {
		const page = printRoot
			.querySelector(`[data-report-id="${CSS.escape(id)}"]`)
			?.closest('.print-page');
		if (page) copy.append(page.cloneNode(true));
	}
	return copy;
}

function pdfOf(printRoot: HTMLElement, ids: string[]): Promise<Blob> {
	return printDocumentHtml(rootOf(printRoot, ids)).then(fetchPdf);
}

/** One student's report as its own PDF. */
export async function downloadReportPdf(
	printRoot: HTMLElement,
	document: MarksheetDocument,
	id: string,
	now: Date
): Promise<void> {
	const student = document.students.find((candidate) => candidate.id === id);
	if (!student) return;
	saveBlob(reportPdfFilename(document, student, now), await pdfOf(printRoot, [id]));
}

/** Every report in `ids` as one PDF, a page each, in the order given. */
export async function downloadReportsPdf(
	printRoot: HTMLElement,
	document: MarksheetDocument,
	ids: string[],
	now: Date
): Promise<void> {
	saveBlob(reportsPdfFilename(document, now), await pdfOf(printRoot, ids));
}

/** A name not already taken: `-2`, `-3`… before the extension, for students who share a name. */
function distinctName(name: string, taken: Set<string>): string {
	let candidate = name;
	for (let n = 2; taken.has(candidate); n++) candidate = name.replace(/\.pdf$/, `-${n}.pdf`);
	taken.add(candidate);
	return candidate;
}

/** One PDF per report in `ids`, zipped. */
export async function downloadReportsZip(
	printRoot: HTMLElement,
	document: MarksheetDocument,
	ids: string[],
	now: Date
): Promise<void> {
	const taken = new Set<string>();
	const files: Record<string, Uint8Array> = {};
	// One at a time: the server renders them in its one shared browser anyway.
	for (const id of ids) {
		const student = document.students.find((candidate) => candidate.id === id);
		if (!student) continue;
		const name = distinctName(reportPdfFilename(document, student, now), taken);
		files[name] = new Uint8Array(await (await pdfOf(printRoot, [id])).arrayBuffer());
	}
	// A PDF is already compressed: storing it keeps the zip quick and no bigger.
	saveBlob(
		reportsZipFilename(document, now),
		new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
	);
}
