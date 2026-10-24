/** The matching API's own request caps, shared by `/api/match` and the browser run.
 *
 * Deliberately separate from the report limits in `marksheet/report-limits.ts`:
 * a report-UI change must never silently change what the matching route accepts
 * or what the run truncates before sending.
 */

/** Most entries one matching call carries, per tier. */
export const MAX_MATCH_ENTRIES = 200;

/** Longest entry id, question number, spec point or command word the matching route accepts. */
export const MAX_MATCH_LABEL_LENGTH = 120;

/** Longest question summary the matching route accepts. */
export const MAX_MATCH_SUMMARY_LENGTH = 300;
