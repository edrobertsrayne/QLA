// How long unbacked work may sit before the teacher is nudged.
//
// The nudge is a toast, not a standing warning: the control on the page already
// says what is unbacked, and a page that nags is one the teacher learns to
// ignore. The surface showing it claims the session's one toast, and takes it
// down once a backup holds the work.

import { backupState } from './backup.js';
import type { MarksheetDocument } from './document.js';

/** How old the oldest unbacked change may be before the teacher is nudged. */
const NUDGE_AFTER_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The nudge the unbacked work calls for right now, or null while it is fresh. */
export function backupNudge(document: MarksheetDocument, now: Date): { days: number } | null {
	const state = backupState(document);
	if (state.kind === 'clean' || state.changedAt === null) return null;

	const ageMs = now.getTime() - state.changedAt.getTime();
	if (ageMs <= NUDGE_AFTER_DAYS * DAY_MS) return null;
	return { days: Math.floor(ageMs / DAY_MS) };
}
