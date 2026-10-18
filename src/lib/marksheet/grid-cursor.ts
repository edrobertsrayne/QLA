// Where the keyboard is on the marksheet grid. Pure: no Svelte, so the rules
// for a cursor whose row or column has gone are testable on their own.

/** A grid cell: a mark cell, or a row's name cell when `entryId` is null. */
export interface GridCell {
	studentId: string;
	entryId: string | null;
}

export interface GridShape {
	studentIds: readonly string[];
	entryIds: readonly string[];
}

/** The cursor if both its row and column still exist, else the first cell, else nothing. */
export function resolveCell(cursor: GridCell | null, shape: GridShape): GridCell | null {
	if (
		cursor &&
		shape.studentIds.includes(cursor.studentId) &&
		(cursor.entryId === null || shape.entryIds.includes(cursor.entryId))
	) {
		return cursor;
	}
	const first = shape.studentIds[0];
	if (first === undefined) return null;
	return { studentId: first, entryId: shape.entryIds[0] ?? null };
}
