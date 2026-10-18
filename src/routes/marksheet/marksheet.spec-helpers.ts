// What the marksheet page specs share: reading the grid as a teacher sees it,
// and delivering a paste the way the browser does. Test-only: nothing in the
// app imports this.

// The frozen columns and truncated names are Tailwind classes, so the
// stylesheet has to be in the page for their computed styles to mean anything.
import '../../app.css';
import { marksheetStore } from '$lib/marksheet/index.js';

/** The class as the grid shows it, in the order it shows them. */
export function rowNames(screen: { container: HTMLElement }): string[] {
	return [...screen.container.querySelectorAll<HTMLElement>('[data-testid="student-name"]')].map(
		(element) => element.textContent?.trim() ?? ''
	);
}

/** The mark cell for one student on one entry, so a test can ask where the cursor went. */
export function markCell(
	screen: { container: HTMLElement },
	studentId: string,
	entryId: string
): HTMLElement {
	const cell = screen.container.querySelector<HTMLElement>(
		`[data-testid="mark-cell"][data-student-id="${studentId}"][data-entry-id="${entryId}"]`
	);
	if (!cell) throw new Error(`no mark cell for ${studentId} on ${entryId}`);
	return cell;
}

/** The first student's id, which the document generates on the teacher's device. */
export function studentIdAt(index: number): string {
	const student = marksheetStore().document?.students[index];
	if (!student) throw new Error(`no student at ${index}`);
	return student.id;
}

/** What a mark cell shows: the mark, or nothing where the cell is unmarked. */
export function cellText(
	screen: { container: HTMLElement },
	studentId: string,
	entryId: string
): string {
	return markCell(screen, studentId, entryId).textContent?.trim() ?? '';
}

/** What one row's progress column reads. */
export function progressText(screen: { container: HTMLElement }, row: number): string {
	const cell = screen.container.querySelectorAll<HTMLElement>('[data-testid="progress-cell"]')[row];
	if (!cell) throw new Error(`no progress cell on row ${row}`);
	return cell.textContent?.trim() ?? '';
}

/** The cells reachable by Tab: the roving tabindex puts exactly one in the tab order. */
export function tabbableCells(screen: { container: HTMLElement }): HTMLElement[] {
	return [...screen.container.querySelectorAll<HTMLElement>('[tabindex="0"]')].filter((cell) =>
		cell.matches('[data-testid="mark-cell"], [data-testid="name-cell"]')
	);
}

/** Where the cursor is, as the cell the keyboard is on. */
export function focusedCell(): Element | null {
	return document.activeElement;
}

/** Deliver a clipboard payload the way a paste event does, on the active cell. */
export function pasteClipboard(
	screen: { container: HTMLElement },
	payload: { html?: string; text?: string },
	target?: Element
): void {
	const data = clipboardPayload(payload);
	const element =
		target ??
		screen.container.querySelector<HTMLElement>(
			'[data-testid="mark-cell"][tabindex="0"], [data-testid="name-cell"][tabindex="0"]'
		);
	if (!element) throw new Error('no paste target');
	element.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
	);
}

/** The two clipboard flavours one paste can carry, with only those the test set. */
function clipboardPayload(payload: { html?: string; text?: string }): DataTransfer {
	const data = new DataTransfer();
	if (payload.html !== undefined) data.setData('text/html', payload.html);
	if (payload.text !== undefined) data.setData('text/plain', payload.text);
	return data;
}
