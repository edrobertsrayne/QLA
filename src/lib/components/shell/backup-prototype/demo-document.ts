// PROTOTYPE (#93), throwaway: a small confirmed marksheet so /marksheet?variant=
// renders on a browser with nothing stored. Only used when storage is empty.

import { confirmed, entry, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';

const ENTRIES = ['1a', '1b', '2a', '2bi', '2bii', '3', '4a', '4b'].map((label, i) =>
	entry(`e${i}`, label, label.replace(/\D.*$/, ''), { marks: 2 + (i % 4) })
);
const NAMES = [
	['Amara', 'Okafor'],
	['Ben', 'Hughes'],
	['Chloe', 'Patel'],
	['Daniel', 'Kowalski'],
	['Ella', 'Nguyen'],
	['Finn', 'O’Brien'],
	['Grace', 'Thompson'],
	['Harvey', 'Singh'],
	['Isla', 'McKenzie'],
	['Jacob', 'Adeyemi']
];

export function demoDocument(): MarksheetDocument {
	const students = NAMES.map(([first, last], i) => student(`s${i}`, first, last));
	const marks = Object.fromEntries(
		students.map((s, si) => [
			s.id,
			Object.fromEntries(ENTRIES.map((e, ei) => [e.id, ((si + ei) * 7) % ((e.marks ?? 1) + 1)]))
		])
	);
	return confirmed({
		paper: { ...confirmed().paper, label: 'Y10 Physics mock', className: '10X' },
		breakdown: { entries: ENTRIES, warnings: [], aoDescriptions: {} },
		students,
		marks
	});
}
