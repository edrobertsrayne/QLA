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

export type GridMove = 'up' | 'down' | 'left' | 'right' | 'next' | 'previous';

/** The cell one move away. The sheet's ends are ends; next/previous wrap rows as Tab does. */
export function step(cell: GridCell, shape: GridShape, move: GridMove): GridCell {
	const row = shape.studentIds.indexOf(cell.studentId);
	if (row === -1) return cell;
	const column = cell.entryId === null ? -1 : shape.entryIds.indexOf(cell.entryId);
	const lastRow = shape.studentIds.length - 1;
	const lastColumn = shape.entryIds.length - 1;
	const at = (r: number, c: number): GridCell => ({
		studentId: shape.studentIds[r],
		entryId: c === -1 ? null : shape.entryIds[c]
	});

	switch (move) {
		case 'up':
		case 'down': {
			// The ends of the sheet are the ends: the cursor stays on the cell, so the
			// keyboard never falls out of the grid mid-entry.
			const to = Math.min(Math.max(row + (move === 'down' ? 1 : -1), 0), lastRow);
			return at(to, column);
		}
		case 'left':
		case 'right': {
			const to = Math.min(Math.max(column + (move === 'right' ? 1 : -1), -1), lastColumn);
			return at(row, to);
		}
		case 'next':
		case 'previous': {
			const offset = move === 'next' ? 1 : -1;
			const entryId = shape.entryIds[column + offset];
			if (entryId !== undefined) return at(row, column + offset);
			const wrappedColumn = offset === 1 ? 0 : lastColumn;
			const wrappedRow = row + offset;
			// Past the first or last cell there is nothing to wrap onto, so the cursor
			// stays on the cell the teacher is on.
			if (lastColumn < 0 || wrappedRow < 0 || wrappedRow > lastRow) return cell;
			return at(wrappedRow, wrappedColumn);
		}
	}
}
