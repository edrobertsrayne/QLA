// The save line the status bar reads out.
//
// Kept out of the component so every state and every age boundary is testable
// without a browser: the bar renders one string that the store's save state
// decides, read against the moment it is displayed.

import { backupTakenAt } from './backup.js';
import type { MarksheetDocument } from './document.js';
import type { SaveState } from './store.svelte.js';

/** How a line reads: a healthy save, one in flight, a refused write, no storage at all. */
export type StatusTone = 'ok' | 'busy' | 'error' | 'warn';

export interface StatusLine {
	tone: StatusTone;
	text: string;
	/** True when storage is not keeping the work, so the only way out is a file. */
	rescue: boolean;
}

/**
 * How long ago a moment was, in the largest unit that still says something:
 * "just now", "12s ago", "3 min ago", "2 h ago", "yesterday", "3 days ago".
 */
export function relativeTime(at: Date, now: Date): string {
	const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
	if (seconds < 10) return 'just now';
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Wall-clock HH:MM, so a line about a failure names a moment the teacher can place. */
function clockTime(at: Date): string {
	const hours = String(at.getHours()).padStart(2, '0');
	const minutes = String(at.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

/** The status bar's line for the store's save state, as of `now`. */
export function statusLine(saveState: SaveState, now: Date): StatusLine {
	switch (saveState.kind) {
		case 'saved':
			return {
				tone: 'ok',
				text: `All changes saved · ${relativeTime(saveState.at, now)}`,
				rescue: false
			};
		case 'saving':
			return { tone: 'busy', text: 'Saving…', rescue: false };
		case 'failed':
			return {
				tone: 'error',
				text: `Couldn't save — changes since ${clockTime(saveState.since)} are only in this tab`,
				rescue: true
			};
		case 'unavailable':
			return {
				tone: 'warn',
				text: "This browser can't store anything — work is lost when the tab closes",
				rescue: true
			};
	}
}

/**
 * The bar's other end: where the work lives, and how old the one file that
 * could bring it back is. The teacher's exposure in one line — the browser's
 * copy is all there is until a backup exists.
 */
export function storageNote(document: MarksheetDocument | null, now: Date): string | null {
	if (!document) return null;
	const takenAt = backupTakenAt(document);
	const age = takenAt === null ? 'no backup yet' : `backup ${relativeTime(takenAt, now)}`;
	return `Stored in this browser only · ${age}`;
}
