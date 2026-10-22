// The marksheet document store: one client-side owner of the stored document.
//
// Load, validate, mutate, persist and derive all happen here, over an injected
// `Storage`-like dependency and clock, so every failure mode and the autosave
// debounce are testable without a browser. Routes render straight from the
// reactive state; every change goes through a command, never by poking the
// document directly.

import type { Breakdown, ParseUsage, ParseWarning } from '$lib/server/parse/schema.js';
import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';
import { analyseMarksheet } from './analysis.js';
import { confirmationBlockers, entryName, needsAttention, questionBands } from './breakdown.js';
import { backupFile, type QlaFile } from './download.js';
import {
	applyPaste,
	emptyPasteResult,
	textGrid,
	type PasteAnchor,
	type PasteResult
} from './paste.js';
import {
	DEFAULT_BELOW_LOWEST_LABEL,
	copyOfDocument,
	DOCUMENT_SCHEMA_VERSION,
	dropUnreachable,
	labelFromFilename,
	localId,
	marksOnEntry,
	marksOverMax,
	putMark,
	removeMark,
	type BreakdownEntry,
	type EntryValues,
	type MarksheetDocument,
	type ReportGenerationInput,
	type ReportProse,
	type StoredStudent,
	type StoredWarning
} from './document.js';
import {
	AUTOSAVE_DEBOUNCE_MS,
	DocumentPersistence,
	type DocumentStorage,
	type SaveState,
	type Unreadable
} from './persistence.svelte.js';
import {
	newNames,
	newStudent,
	sortStudentsByName,
	studentName,
	type StudentName,
	type StudentSortKey
} from './students.js';
import { keepWording, setReportEdit, writeReport } from './report-commands.js';
import { clearBoundaries, setBoundaries } from './grades.js';
import type { Undoable, UndoableChange } from './undo-notice.js';

export interface MarksheetStoreDeps {
	storage: DocumentStorage;
	now: () => Date;
	debounceMs?: number;
}

/** The surface the stored state allows. */
export type BootRoute = '/' | '/breakdown' | '/marksheet';

export interface CreateFromParseInput {
	breakdown: Breakdown;
	warnings: ParseWarning[];
	/** Shown for this session; never stored. */
	usage: ParseUsage;
	filenames: string[];
}

/** A field the teacher has cleared means "none", not an empty string. */
function trimOrNull(value: string | null): string | null {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? null : trimmed;
}

export class MarksheetStore {
	readonly #now: () => Date;
	readonly #persistence: DocumentPersistence;

	document = $state<MarksheetDocument | null>(null);
	entries = $derived(this.document?.breakdown.entries ?? []);
	students = $derived(this.document?.students ?? []);
	warnings = $derived(this.document?.breakdown.warnings ?? []);
	/** The stored document that could not be read, if the last read found one. */
	unreadable = $state<Unreadable | null>(null);
	/** This session's parse cost. Absent after a reload. */
	runUsage = $state<ParseUsage | null>(null);
	/** The one change undo would take back, or nothing. */
	undoable = $state<Undoable | null>(null);
	/**
	 * What the last paste did, for the notice beside the grid. It lives here so it
	 * is cleared by the same change that clears the undo the paste offered —
	 * a stale account beside a sheet that has moved on is worse than none.
	 */
	pasteNotice = $state<PasteResult | null>(null);
	/**
	 * Whether the teacher has said "remind me later" this session. It is not
	 * part of the document — a reload asks again, because the risk is still
	 * there — and it goes with the document it was about.
	 */
	backupReminderDismissed = $state(false);

	constructor(deps: MarksheetStoreDeps) {
		this.#now = deps.now;
		this.#persistence = new DocumentPersistence({
			storage: deps.storage,
			now: deps.now,
			debounceMs: deps.debounceMs ?? AUTOSAVE_DEBOUNCE_MS,
			current: () => this.document
		});
	}

	/** Whether the document in hand has reached storage. */
	get saveState(): SaveState {
		return this.#persistence.saveState;
	}

	/**
	 * Read the stored document. Safe to call on every navigation: with a document
	 * in hand it returns at once, because in-memory state is the truth; storage is
	 * read only while there is nothing in hand to lose.
	 */
	load(): void {
		if (this.document) return;
		const read = this.#persistence.read();
		this.#adopt(read.kind === 'ready' ? dropUnreachable(read.document) : null);
		if (read.kind === 'corrupt') this.unreadable = read.unreadable;
	}

	/** The surface the stored state allows. */
	route(): BootRoute {
		const document = this.document;
		if (!document) return '/';
		return document.breakdownConfirmedAt === null ? '/breakdown' : '/marksheet';
	}

	/** The bands the breakdown table groups its rows under. */
	questionBands = $derived(questionBands(this.entries));

	/** What stops the breakdown being confirmed right now. */
	blockers = $derived(confirmationBlockers(this.entries));

	/** The entries worth a second look before confirming, in document order. */
	attention = $derived(this.document ? needsAttention(this.document.breakdown) : []);

	/**
	 * What the marks say about every entry: facility, band and coverage, worst
	 * first. Derived from the document as it stands, so it is current on every
	 * change and there is nothing to run or to go out of date.
	 */
	analysis = $derived(analyseMarksheet(this.document));

	/**
	 * The parse handoff: a run that validated becomes the stored document at
	 * once, unconfirmed, so a reload before the teacher has read it costs
	 * nothing. `usage` stays in memory.
	 */
	createFromParse(input: CreateFromParseInput): void {
		const at = this.#now();
		const entries: BreakdownEntry[] = input.breakdown.questions.map((question) => {
			const values: EntryValues = {
				label: question.id,
				questionNumber: question.questionNumber,
				marks: question.marks,
				summary: question.summary,
				specPoint: question.specPoint,
				commandWord: question.commandWord,
				ao: question.ao
			};
			// What the parse produced, so the review table can show what has been
			// changed since.
			return { id: localId(), ...values, original: { ...values } };
		});
		const entryIdFor = (label: string | null): string | null => {
			if (label === null) return null;
			const matches = input.breakdown.questions.filter((question) => question.id === label);
			// Only a label naming exactly one entry can carry a finding. A label the
			// parse repeated, or one it never emitted (`q[3]` for an entry with no
			// id), cannot be pinned to a row, so it stays beside the table.
			return matches.length === 1
				? entries[input.breakdown.questions.indexOf(matches[0])].id
				: null;
		};
		const warnings: StoredWarning[] = input.warnings.map((warning) => ({
			...warning,
			questionId: entryIdFor(warning.questionId)
		}));

		const document: MarksheetDocument = {
			schemaVersion: DOCUMENT_SCHEMA_VERSION,
			createdAt: at.toISOString(),
			updatedAt: at.toISOString(),
			breakdownConfirmedAt: null,
			lastExportedAt: null,
			paper: {
				label: labelFromFilename(input.filenames[0]),
				className: null,
				sourceFilenames: [...input.filenames],
				parsedAt: at.toISOString(),
				boundaries: null,
				belowLowestLabel: DEFAULT_BELOW_LOWEST_LABEL
			},
			breakdown: { entries, warnings },
			students: [],
			marks: {},
			topicNames: {},
			reports: {}
		};
		this.#adopt(document);
		this.runUsage = input.usage;
		this.#persistence.writeNow();
	}

	/** Rename the paper. Blank means no label. */
	setPaperLabel(label: string): void {
		const document = this.document;
		if (!document) return;
		document.paper.label = trimOrNull(label);
		this.#mutated();
	}

	/** Name the class. Blank means no name. */
	setClassName(name: string): void {
		const document = this.document;
		if (!document) return;
		document.paper.className = trimOrNull(name);
		this.#mutated();
	}

	/** Edit a breakdown entry's label: display only, so no marks move. */
	setEntryLabel(entryId: string, label: string): void {
		this.#editEntries([entryId], (entry) => {
			entry.label = label.trim();
		});
	}

	/** Edit what the entry asks. */
	setEntrySummary(entryId: string, summary: string): void {
		this.#editEntries([entryId], (entry) => {
			entry.summary = summary;
		});
	}

	/**
	 * Re-band a whole band under one question number, or a single row when the
	 * table is not banded: the number belongs to the band rather than the row,
	 * so every entry in a run moves together.
	 */
	setBandQuestionNumber(entryIds: readonly string[], questionNumber: string): void {
		const number = questionNumber.trim();
		this.#editEntries(entryIds, (entry) => {
			entry.questionNumber = number;
		});
	}

	/**
	 * Set an entry's available marks, or null to leave it unknown. Only a
	 * positive whole number is taken: anything else is refused outright, so a
	 * typo cannot become a fractional or negative column. Marks already entered
	 * by students are never clamped to the new total.
	 */
	setEntryMarks(entryId: string, marks: number | null): void {
		if (marks !== null && (!Number.isInteger(marks) || marks < 1)) return;
		this.#editEntries([entryId], (entry) => {
			entry.marks = marks;
		});
	}

	/** Set the specification point. An empty field means none. */
	setEntrySpecPoint(entryId: string, specPoint: string | null): void {
		this.#editEntries([entryId], (entry) => {
			entry.specPoint = trimOrNull(specPoint);
		});
	}
	/**
	 * Name one normalised specification-point code. A blank name clears it, so
	 * an unwanted proposal is one keystroke from gone. Names for codes no entry
	 * carries are dropped on load, so a retyped code loses its stale name.
	 * Topic names are not breakdown edits: naming works on a confirmed sheet.
	 */
	setTopicName(code: string, name: string): void {
		const document = this.document;
		if (!document) return;
		const trimmed = name.trim();
		if (trimmed === '') delete document.topicNames[code];
		else document.topicNames[code] = trimmed;
		this.#mutated();
	}

	/** Set the command word. An empty field means none. */
	setEntryCommandWord(entryId: string, commandWord: string | null): void {
		this.#editEntries([entryId], (entry) => {
			entry.commandWord = trimOrNull(commandWord);
		});
	}

	/** Set the assessment objective, or null for none. */
	setEntryAo(entryId: string, ao: AssessmentObjective | null): void {
		this.#editEntries([entryId], (entry) => {
			entry.ao = ao;
		});
	}

	/**
	 * Insert an entry the parse missed below the entry named, and hand back its
	 * id. It joins the question of the row it follows, and carries nothing else:
	 * a blank label and no marks stop it being mistaken for something the parse
	 * found.
	 */
	insertEntryAfter(entryId: string): string | null {
		const document = this.#editable();
		if (!document) return null;

		const entries = document.breakdown.entries;
		const after = entries.findIndex((entry) => entry.id === entryId);
		if (after === -1) return null;

		const entry = this.#blankEntry(entries[after].questionNumber);
		entries.splice(after + 1, 0, entry);
		this.#mutated();
		return entry.id;
	}

	/**
	 * Add an entry at the end of the breakdown, and hand back its id. It is a
	 * question of its own for the teacher to number — the paper's last question
	 * is the one a parse most often misses — so numbering it moves no other row.
	 */
	appendEntry(): string | null {
		const document = this.#editable();
		if (!document) return null;

		const entry = this.#blankEntry('');
		document.breakdown.entries.push(entry);
		this.#mutated();
		return entry.id;
	}

	/** Delete an entry, leaving it — and what was recorded against it — one undo away. */
	deleteEntry(entryId: string): boolean {
		if (!this.#editable()) return false;
		return this.#commit((document) => {
			const entries = document.breakdown.entries;
			const index = entries.findIndex((entry) => entry.id === entryId);
			if (index === -1) return null;
			const [entry] = entries.splice(index, 1);

			// What was recorded against the entry goes with it: nothing can reach it
			// again, so it would sit in the document unread.
			for (const byEntry of Object.values(document.marks)) delete byEntry[entryId];
			document.breakdown.warnings = document.breakdown.warnings.filter(
				(warning) => warning.questionId !== entryId
			);
			return { kind: 'entry-removal', name: entryName(entry) };
		});
	}

	/**
	 * Take back the one change undo covers, if there is one, and say whether
	 * there was: a change the teacher does not want is then one click from gone.
	 */
	undo(): boolean {
		const undoable = this.undoable;
		const document = this.document;
		if (!undoable || !document) return false;

		// A backup taken since the change is not taken back with it.
		this.document = { ...undoable.before, lastExportedAt: document.lastExportedAt };
		this.#mutated();
		return true;
	}

	/** Move an entry one place up or down, to put the columns in the paper's order. */
	moveEntry(entryId: string, offset: -1 | 1): boolean {
		const document = this.#editable();
		if (!document) return false;

		const entries = document.breakdown.entries;
		const from = entries.findIndex((entry) => entry.id === entryId);
		const to = from + offset;
		if (from === -1 || to < 0 || to >= entries.length) return false;

		const [entry] = entries.splice(from, 1);
		entries.splice(to, 0, entry);
		this.#mutated();
		return true;
	}

	/**
	 * Add a student to the class, and hand back the id their marks are filed
	 * under. The class is whatever the teacher pastes or types, in the order they
	 * put it in — nothing here sorts them behind the teacher's back.
	 */
	addStudent(name: StudentName): string | null {
		const document = this.document;
		if (!document) return null;

		const student = newStudent(name);
		document.students.push(student);
		this.#mutated();
		return student.id;
	}

	#studentById(studentId: string): StoredStudent | undefined {
		return this.document?.students.find((candidate) => candidate.id === studentId);
	}

	/**
	 * Rename a student. Both parts are held separately, so either can be edited
	 * alone — and since marks are filed under the student's id, a rename moves
	 * nothing.
	 */
	renameStudent(studentId: string, name: StudentName): void {
		const student = this.#studentById(studentId);
		if (!student) return;

		student.firstName = name.firstName;
		student.surname = name.surname;
		this.#mutated();
	}

	/**
	 * Flag a student absent, or clear the flag. Their marks stay where they are:
	 * absent is a flag on the student, not a mark, and clearing it counts them
	 * again.
	 */
	setStudentAbsent(studentId: string, absent: boolean): void {
		const student = this.#studentById(studentId);
		if (!student) return;

		student.absent = absent;
		this.#mutated();
	}

	/** Remove a student, taking their marks with them, one undo away. */
	removeStudent(studentId: string): boolean {
		return this.#commit((document) => {
			const students = document.students;
			const index = students.findIndex((student) => student.id === studentId);
			if (index === -1) return null;
			const [student] = students.splice(index, 1);

			// Marks and a report whose student is gone can never be read again, so they go too.
			delete document.marks[studentId];
			delete document.reports[studentId];
			return { kind: 'student-removal', name: studentName(student) };
		});
	}

	/** Put the class in order by one name part. The stored array is display order. */
	sortStudents(by: StudentSortKey): void {
		const document = this.document;
		if (!document) return;

		document.students = sortStudentsByName(document.students, by);
		this.#mutated();
	}

	/**
	 * Make a class out of a pasted column of names, one per line, and say how
	 * many students it made. Lines that hold no name are not students. Text
	 * copied from a spreadsheet with marks beside the names (tab-separated) is a
	 * block anchored in the name column, so one copy builds the class and its marks.
	 */
	pasteNames(names: string): number {
		return this.pasteMarks(textGrid(names), { kind: 'names', studentId: null }).studentsAdded;
	}

	/**
	 * Add the students an uploaded class list names to the end of the class,
	 * skipping those the class already has, and keep the account of it for the
	 * notice beside the grid. One undo takes the whole upload back.
	 */
	addStudentsFromUpload(names: readonly StudentName[]): PasteResult {
		let result = emptyPasteResult();
		this.#commit((document) => {
			const { added, skipped } = newNames(document.students, names);
			document.students.push(...added.map(newStudent));
			result = {
				...result,
				changed: added.length > 0,
				studentsAdded: added.length,
				duplicatesSkipped: skipped
			};
			return result.changed ? { kind: 'mark-paste' } : null;
		});
		this.pasteNotice = result.changed || result.duplicatesSkipped > 0 ? result : null;
		return result;
	}

	/**
	 * Record the mark one student gained on one entry. Whole numbers only, and
	 * never clamped to the entry's available marks: a typo is stored and flagged
	 * rather than quietly rewritten into a mark the teacher never gave. Zero is a
	 * mark; a cell with none is not in the map at all.
	 */
	setMark(studentId: string, entryId: string, mark: number): void {
		if (!Number.isInteger(mark) || mark < 0) return;
		const document = this.#markable(studentId, entryId);
		if (!document) return;
		// The mark already there is not a change: re-entering it must not spend the
		// undo the teacher still wants, or bump the document's timestamp.
		if (!putMark(document.marks, studentId, entryId, mark)) return;
		this.#mutated();
	}

	/**
	 * Clear a mark back to unmarked, so the cell is one the teacher has not got
	 * to yet rather than one they gave nothing.
	 */
	clearMark(studentId: string, entryId: string): void {
		const document = this.#markable(studentId, entryId);
		if (!document || !removeMark(document.marks, studentId, entryId)) return;
		this.#mutated();
	}

	/**
	 * Paste a block of cells from a spreadsheet at the anchor, by the rules in
	 * `applyPaste`, and keep the account of it for the notice beside the grid. A
	 * paste that changes nothing keeps no undo of its own.
	 */
	pasteMarks(rows: readonly (readonly string[])[], anchor: PasteAnchor): PasteResult {
		if (!this.document) return emptyPasteResult();

		// The snapshot is taken before the first cell lands: undo puts back the
		// document exactly as the teacher had it, added students included.
		let result = emptyPasteResult();
		this.#commit((document) => {
			result = applyPaste(document, rows, anchor);
			return result.changed ? { kind: 'mark-paste' } : null;
		});
		// A paste with nothing to say — every cell already held what was pasted —
		// leaves no notice behind.
		const worthNoticing =
			result.changed ||
			result.refused.length > 0 ||
			result.columnsClipped > 0 ||
			result.rowsDropped > 0;
		this.pasteNotice = worthNoticing ? result : null;
		return result;
	}

	/**
	 * Confirm the breakdown, unless something blocks the marksheet it would
	 * build: an entry with no marks, or a blank or repeated label. Returns
	 * whether the breakdown is confirmed, changing nothing when it is not.
	 */
	confirmBreakdown(): boolean {
		const document = this.document;
		if (!document) return false;
		if (document.breakdownConfirmedAt !== null) return true;
		if (confirmationBlockers(document.breakdown.entries).blocked) return false;

		document.breakdownConfirmedAt = this.#now().toISOString();
		this.#mutated();
		return true;
	}

	/**
	 * Unlock a confirmed breakdown: the one action that makes it editable again,
	 * so a mistake found mid-marking is fixable without wiping the marks. The
	 * marks are left exactly as they are — nothing is clamped — and what a change
	 * costs them is put to the teacher before they make it.
	 */
	unlockBreakdown(): boolean {
		const document = this.document;
		if (!document || document.breakdownConfirmedAt === null) return false;

		document.breakdownConfirmedAt = null;
		this.#mutated();
		return true;
	}

	/**
	 * How many marks students have recorded against an entry: what deleting it
	 * takes with it.
	 */
	marksOnEntry(entryId: string): number {
		const document = this.document;
		return document === null ? 0 : marksOnEntry(document, entryId);
	}

	/**
	 * How many of an entry's marks sit above the available marks it now offers:
	 * what lowering them leaves behind, and what no figure counts until the entry
	 * is raised back or the mark corrected. Nothing is ever clamped, so this is
	 * what the teacher has to be told about rather than have fixed for them.
	 */
	marksOverMax(entryId: string): number {
		const document = this.document;
		return document === null ? 0 : marksOverMax(document, entryId);
	}

	/** Write anything pending now: a hidden or closing tab must not lose keystrokes. */
	flush(): void {
		this.#persistence.flush();
	}

	/**
	 * Take a backup: the document as it stands, stamped so restoring it brings
	 * back when it was taken. The file is built after the write, so what the
	 * teacher saves is byte-identical to what a restore would find here — and it
	 * is handed out whether or not storage would take it, since a browser that
	 * refuses the write is exactly when the file matters most.
	 */
	takeBackup(): QlaFile | null {
		const document = this.document;
		if (!document) return null;

		const at = this.#now().toISOString();
		document.lastExportedAt = at;
		document.updatedAt = at;
		this.#persistence.writeNow();
		return backupFile(document, this.#now());
	}

	/**
	 * Store one student's generated report: prose, the verbatim generation
	 * input it was written from, the model used (display only) and the clock.
	 * A rewrite clears any teacher edit beside it: this is fresh wording.
	 */
	storeReport(
		studentId: string,
		prose: ReportProse,
		input: ReportGenerationInput,
		model: string
	): void {
		const document = this.document;
		const at = this.#now().toISOString();
		if (document && writeReport(document, studentId, prose, input, model, at)) this.#mutated();
	}

	/**
	 * Edit one student's generated feedback in place; see `setReportEdit`.
	 * Typing a report twice running keeps one undo, not one per keystroke: the
	 * edit is one change, whatever it took to type it.
	 */
	editReport(studentId: string, prose: ReportProse): void {
		this.#commit((document) =>
			setReportEdit(document, studentId, prose) ? { kind: 'report-edit', studentId } : null
		);
	}

	/**
	 * Drop the teacher's edit beside one student's generated prose, showing the
	 * generated wording again with no model call. A report with no edit is left
	 * alone: there is nothing to take back, so nothing is spent.
	 */
	revertReport(studentId: string): void {
		this.#commit((document) =>
			setReportEdit(document, studentId, null) ? { kind: 'report-edit', studentId } : null
		);
	}

	/**
	 * Accept the generated prose as still right, with no model call; see
	 * `keepWording`. One undo takes it back.
	 */
	keepReportWording(studentId: string): void {
		this.#commit((document) =>
			keepWording(document, studentId) ? { kind: 'report-kept', studentId } : null
		);
	}

	/**
	 * Save the paper's grade boundaries: the kept rows top grade first, with
	 * blank and unawarded rows left out, and the below-lowest label. One undo
	 * takes the save back, like every other marksheet change.
	 */
	saveBoundaries(boundaries: { label: string; minimum: number }[], belowLowestLabel: string): void {
		this.#commit((document) => {
			setBoundaries(document, boundaries, belowLowestLabel);
			return { kind: 'grade-boundaries', action: 'saved' };
		});
	}

	/** Drop every boundary, back to marks only, one undo away. */
	removeBoundaries(): void {
		this.#commit((document) =>
			clearBoundaries(document) ? { kind: 'grade-boundaries', action: 'removed' } : null
		);
	}

	/** Say no to the reminder for this session. The next document asks again. */
	dismissBackupReminder(): void {
		this.backupReminderDismissed = true;
	}
	/**
	 * Adopt a document read from a backup file, and say whether it was taken —
	 * not when this browser already holds a document (replacing one is the
	 * new-upload dialog's job, with its account of the loss), in which case the
	 * app is left exactly as it was. Unreachable marks are dropped on the way
	 * in, exactly as they would be on the next boot, and the document reaches
	 * storage at once rather than on the debounce: it is the teacher's only copy
	 * until they back up again.
	 */
	restoreBackup(document: MarksheetDocument): boolean {
		if (this.document) return false;
		this.#adopt(dropUnreachable(document));
		this.#persistence.writeNow();
		return true;
	}

	/** New upload: discard the marksheet document and nothing else. */
	wipe(): void {
		this.#persistence.clear();
		this.#adopt(null);
	}

	/** An entry the teacher adds: nothing claimed, everything to fill in. */
	#blankEntry(questionNumber: string): BreakdownEntry {
		return {
			id: localId(),
			label: '',
			questionNumber,
			marks: null,
			summary: '',
			specPoint: null,
			commandWord: null,
			ao: null,
			original: null
		};
	}

	/**
	 * The document as a command may change it. A confirmed breakdown is
	 * read-only, and the unlock that makes it editable again is an action of its
	 * own — so every breakdown edit starts here.
	 */
	#editable(): MarksheetDocument | null {
		const document = this.document;
		if (!document || document.breakdownConfirmedAt !== null) return null;
		return document;
	}

	/**
	 * The document a mark may be filed in. A mark is reached through a student
	 * and an entry, so both have to be there: one pointing at either that is gone
	 * could never be read again.
	 */
	#markable(studentId: string, entryId: string): MarksheetDocument | null {
		const document = this.document;
		if (!document) return null;
		if (!document.students.some((student) => student.id === studentId)) return null;
		if (!document.breakdown.entries.some((entry) => entry.id === entryId)) return null;
		return document;
	}

	/**
	 * Apply one edit to the entries a command targets, then autosave it. An edit
	 * naming no entry in the document changes nothing.
	 */
	#editEntries(entryIds: readonly string[], edit: (entry: BreakdownEntry) => void): void {
		const document = this.#editable();
		if (!document) return;

		let edited = false;
		for (const entryId of entryIds) {
			const entry = document.breakdown.entries.find((candidate) => candidate.id === entryId);
			if (!entry) continue;
			edit(entry);
			edited = true;
		}
		if (edited) this.#mutated();
	}

	/** Take a document, or none, as the one in hand: nothing about the previous one carries over. */
	#adopt(document: MarksheetDocument | null): void {
		this.document = document;
		this.undoable = null;
		this.pasteNotice = null;
		this.unreadable = null;
		this.runUsage = null;
		this.backupReminderDismissed = false;
	}

	/**
	 * One undoable change: snapshot, apply, persist, then offer the undo. `change`
	 * returns what the undo describes, or null when it changed nothing (no write,
	 * no spent undo). Changes to the same report in a row share the first one's
	 * snapshot, so a whole edit is one thing to take back.
	 */
	#commit(change: (document: MarksheetDocument) => UndoableChange | null): boolean {
		const document = this.document;
		if (!document) return false;
		const running = this.undoable;
		const snapshot = copyOfDocument(document);
		const offered = change(document);
		if (offered === null) return false;
		const continues =
			(running?.kind === 'report-edit' || running?.kind === 'report-kept') &&
			running.kind === offered.kind &&
			'studentId' in offered &&
			running.studentId === offered.studentId;
		// `#mutated` clears the undo on offer, so the new one is set after it.
		this.#mutated();
		const undoable: Undoable = { ...offered, before: continues ? running.before : snapshot };
		this.undoable = undoable;
		return true;
	}

	/** Every command ends here: stamp the change, then save on the debounce. */
	#mutated(): void {
		const document = this.document;
		if (!document) return;
		// Undo covers the change just made, so a later one takes its place — and
		// with it the account of the paste the undo was offering.
		this.undoable = null;
		this.pasteNotice = null;
		document.updatedAt = this.#now().toISOString();
		this.#persistence.changed();
	}
}
