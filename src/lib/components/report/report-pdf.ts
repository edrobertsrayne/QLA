// Report PDFs: the printed pages of the Review step, sent to the server to be
// rendered. The pages are the print copies `PrintRoot` already holds (measured
// and settled, edits included), so a PDF carries what Print would print.

import { zipSync } from 'fflate';
import { exportFilename, reportPdfFilename, saveBlob } from '$lib/marksheet/download.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { fetchPdf, printDocumentHtml } from '$lib/print-pdf.js';

/**
 * What a download is of: one student's page as its own PDF, every report in
 * `ids` as one PDF, or one PDF each in a zip. Also what the page is busy with
 * while it runs.
 */
export type ReportDownload = { kind: 'page'; id: string } | { kind: 'one' | 'zip'; ids: string[] };

/** The students a download covers, in order. */
export const downloadIds = (download: ReportDownload): string[] =>
	download.kind === 'page' ? [download.id] : download.ids;

/** A copy of the print root holding only the pages of `ids`, in that order. */
function rootOf(printRoot: HTMLElement, ids: string[]): HTMLElement {
	const copy = printRoot.cloneNode(false) as HTMLElement;
	for (const id of ids) {
		const page = printRoot
			.querySelector(`[data-report-id="${CSS.escape(id)}"]`)
			?.closest('.print-page');
		if (!page) throw new Error(`No report page for student ${id}`);
		copy.append(page.cloneNode(true));
	}
	return copy;
}

/** The student `id` in `document`; a report for someone not on the sheet is a bug. */
function studentOf(document: MarksheetDocument, id: string): MarksheetDocument['students'][number] {
	const student = document.students.find((candidate) => candidate.id === id);
	if (!student) throw new Error(`No student ${id} on the marksheet`);
	return student;
}

function pdfOf(printRoot: HTMLElement, ids: string[]): Promise<Blob> {
	return printDocumentHtml(rootOf(printRoot, ids)).then(fetchPdf);
}

/** A name not already taken: `-2`, `-3`… before the extension, for students who share a name. */
function distinctName(name: string, taken: Set<string>): string {
	let candidate = name;
	for (let n = 2; taken.has(candidate); n++) candidate = name.replace(/\.pdf$/, `-${n}.pdf`);
	taken.add(candidate);
	return candidate;
}

/** One PDF per report in `ids`, zipped. */
async function downloadZip(
	printRoot: HTMLElement,
	document: MarksheetDocument,
	ids: string[],
	now: Date
): Promise<void> {
	const taken = new Set<string>();
	const files: Record<string, Uint8Array> = {};
	// One at a time: the server renders them in its one shared browser anyway.
	for (const id of ids) {
		const student = studentOf(document, id);
		const name = distinctName(reportPdfFilename(document, student, now), taken);
		files[name] = new Uint8Array(await (await pdfOf(printRoot, [id])).arrayBuffer());
	}
	// A PDF is already compressed: storing it keeps the zip quick and no bigger.
	saveBlob(
		exportFilename('reports', document, now, 'zip'),
		new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
	);
}

/** Render `download` from the print root and save the file. */
export async function downloadReports(
	printRoot: HTMLElement,
	document: MarksheetDocument,
	download: ReportDownload,
	now: Date
): Promise<void> {
	switch (download.kind) {
		case 'page': {
			const student = studentOf(document, download.id);
			saveBlob(reportPdfFilename(document, student, now), await pdfOf(printRoot, [download.id]));
			return;
		}
		case 'one':
			saveBlob(
				exportFilename('reports', document, now, 'pdf'),
				await pdfOf(printRoot, download.ids)
			);
			return;
		case 'zip':
			await downloadZip(printRoot, document, download.ids, now);
	}
}
