// The marksheet document store: one client-side owner of the stored document.
//
// Load, validate, mutate, persist and derive all happen here, over an injected
// `Storage`-like dependency and clock, so every failure mode and the autosave
// debounce are testable without a browser. Routes render straight from the
// reactive state; every change goes through a command, never by poking the
// document directly.

import type { ParseUsage } from '$lib/server/parse/schema.js';
import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';
import {
	applyAoDescription,
	assessmentFromParses,
	trimOrNull,
	type CreateFromAssessmentInput
} from './create-assessment.js';
import {
	appendEntry,
	commonQuestionsAfter,
	insertEntryAfter,
	moveEntry,
	removeEntry
} from './breakdown-commands.js';
import {
	addUnplacedStudents,
	addUploadedStudents,
	isTierTarget,
	placeStudents,
	removeStudent
} from './student-commands.js';
import { analyseTier, type MarksheetAnalysis } from './analysis.js';
import {
	assessmentBlockers,
	needsAttention,
	questionBands,
	type AssessmentBlockers,
	type AttentionItem,
	type QuestionBand
} from './breakdown.js';
import { backupFile, type QlaFile } from './download.js';
import {
	applyPaste,
	emptyPasteResult,
	textGrid,
	trimPasteGrid,
	type PasteAnchor,
	type PasteResult
} from './paste.js';
import {
	allEntries,
	copyOfDocument,
	dropUnreachable,
	ENTRY_MARKS_REFUSAL,
	entryTierOf,
	MARK_REFUSAL,
	marksOnEntry,
	marksOverMax,
	pairOfEntry,
	partnerIdOf,
	putMark,
	removeMark,
	restingTier,
	tierEntries,
	tierNameProblem,
	tierNameProblemMessage,
	type AoDescriptions,
	type BreakdownEntry,
	type CommonQuestion,
	type MarksheetDocument,
	type ReportGenerationInput,
	type ReportProse,
	type StoredStudent,
	type StoredTier,
	type StoredWarning,
	type TierIndex
} from './document.js';
import {
	AUTOSAVE_DEBOUNCE_MS,
	DocumentPersistence,
	type DocumentStorage,
	type SaveState,
	type Unreadable
} from './persistence.svelte.js';
import {
	newStudent,
	sortStudentsByName,
	type StudentName,
	type StudentSortKey
} from './students.js';
import { keepWording, setReportEdit, writeReport } from './report-commands.js';
import { clearBoundaries, setBoundaries } from './grades.js';
import { withChangeUndone, type Undoable, type UndoableChange } from './undo-notice.js';

export interface MarksheetStoreDeps {
	storage: DocumentStorage;
	now: () => Date;
	debounceMs?: number;
}

/** The surface the stored state allows. */
export type BootRoute = '/' | '/breakdown' | '/marksheet';

export class MarksheetStore {
	readonly #now: () => Date;
	readonly #persistence: DocumentPersistence;

	document = $state<MarksheetDocument | null>(null);
	tierCount: number = $derived(this.document?.tiers.length ?? 0);
	tiers: StoredTier[] = $derived(this.document?.tiers ?? []);
	entries: BreakdownEntry[] = $derived(this.document ? allEntries(this.document) : []);
	students: StoredStudent[] = $derived(this.document?.students ?? []);
	warnings: StoredWarning[] = $derived(this.tiers.flatMap((tier) => tier.breakdown.warnings));
	aoDescriptions: AoDescriptions = $derived(this.document?.aoDescriptions ?? {});
	commonQuestions: CommonQuestion[] = $derived(this.document?.commonQuestions ?? []);
	label: string | null = $derived(this.document?.label ?? null);
	className: string | null = $derived(this.document?.className ?? null);
	/** The stored document that could not be read, if the last read found one. */
	unreadable = $state<Unreadable | null>(null);
	/** This session's parse cost. Absent after a reload. */
	runUsage = $state<ParseUsage | null>(null);
	/** Why matching proposed no pairs, when it failed. Session-only, like `runUsage`. */
	matchNotice = $state<string | null>(null);
	/** The one change undo would take back, or nothing. */
	undoable = $state<Undoable | null>(null);
	/**
	 * What the last paste did, for the notice beside the grid. It lives here so it
	 * is cleared by the same change that clears the undo the paste offered —
	 * a stale account beside a sheet that has moved on is worse than none.
	 */
	pasteNotice = $state<PasteResult | null>(null);
	/**
	 * Why a paste was refused outright, when there is nowhere to put it: a
	 * class list with marks has to wait for a tier. Session-only, cleared by the
	 * next change like the paste notice.
	 */
	pasteRefusal = $state<string | null>(null);
	/**
	 * Whether this session's one backup nudge toast has been shown. It is about
	 * the document in hand, so a new document asks again; a reload starts over.
	 */
	backupNudgeShown = $state(false);

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

	/** What stops the whole assessment being confirmed right now. */
	blockers: AssessmentBlockers = $derived(
		this.document
			? assessmentBlockers(this.document)
			: { blocked: false, tiers: [], blankTierNames: [], sameTierNames: false, unequalPairs: [] }
	);

	/** One tier's entries in paper order. */
	entriesOf(tier: TierIndex): BreakdownEntry[] {
		return this.document ? tierEntries(this.document, tier) : [];
	}

	/** The bands one tier's breakdown table groups its rows under. */
	bandsOf(tier: TierIndex): QuestionBand[] {
		return questionBands(this.entriesOf(tier));
	}

	/** The entries on one tier worth a second look before confirming, in document order. */
	attentionOf(tier: TierIndex): AttentionItem[] {
		const stored = this.document?.tiers[tier];
		return stored ? needsAttention(stored.breakdown) : [];
	}

	/**
	 * What the marks say about every entry on one tier: facility, band and
	 * coverage, worst first. Derived from the document as it stands, so it is
	 * current on every change and there is nothing to run or to go out of date.
	 */
	analysisOf(tier: TierIndex): MarksheetAnalysis {
		return analyseTier(this.document, tier);
	}

	/** The students who sit one tier. */
	studentsOf(tier: TierIndex): StoredStudent[] {
		return this.students.filter((student) => student.tier === tier);
	}

	/** The students whose tier is not set yet. */
	studentsWithoutTier(): StoredStudent[] {
		return this.students.filter((student) => student.tier === null);
	}

	/** One tier's parse findings, the ones beside its own breakdown. */
	warningsOf(tier: TierIndex): StoredWarning[] {
		return this.document?.tiers[tier]?.breakdown.warnings ?? [];
	}

	/** The pair one entry belongs to, or null when it is not a common question. */
	pairOf(tier: TierIndex, entryId: string): CommonQuestion | null {
		return this.document ? pairOfEntry(this.document, tier, entryId) : null;
	}

	/** The other tier's entry id in an entry's pair, or null when it has no partner. */
	partnerOf(tier: TierIndex, entryId: string): string | null {
		return this.document ? partnerIdOf(this.document, tier, entryId) : null;
	}

	/**
	 * The parse handoff: a finished run becomes the stored document at once,
	 * unconfirmed, so a reload before the teacher has read it costs nothing.
	 * `usage` stays in memory.
	 */
	createFromAssessment(input: CreateFromAssessmentInput): void {
		this.#adopt(assessmentFromParses(input, this.#now()));
		this.runUsage = input.usage;
		this.matchNotice = input.matchNotice ?? null;
		this.#persistence.writeNow();
	}

	/** Rename the paper. Blank means no label. */
	setPaperLabel(label: string): void {
		const document = this.document;
		if (!document) return;
		document.label = trimOrNull(label);
		this.#mutated();
	}

	/** Name the class. Blank means no name. */
	setClassName(name: string): void {
		const document = this.document;
		if (!document) return;
		document.className = trimOrNull(name);
		this.#mutated();
	}

	/**
	 * Name one tier as it is printed on its paper. Display data, so a confirmed
	 * breakdown does not lock it; a blank name clears it on a single tier. Two
	 * tiers need distinct names: a blank or the other tier's name would make the
	 * tabs untellable apart, which is the rule that blocks confirmation. A
	 * refused name is returned as the reason to show beside the field.
	 */
	setTierName(tier: TierIndex, name: string): string | null {
		const document = this.document;
		if (!document) return null;
		const stored = document.tiers[tier];
		if (stored === undefined) return null;

		const trimmed = trimOrNull(name);
		if (stored.tierName === trimmed) return null;
		const problem = tierNameProblem(document, tier, trimmed);
		if (problem !== null) return tierNameProblemMessage(problem);
		stored.tierName = trimmed;
		this.#mutated();
		return null;
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
	 * by students are never clamped to the new total. The refusal is returned
	 * for the field beside it to show.
	 */
	setEntryMarks(entryId: string, marks: number | null): string | null {
		if (marks !== null && (!Number.isInteger(marks) || marks < 1)) return ENTRY_MARKS_REFUSAL;
		this.#editEntries([entryId], (entry) => {
			entry.marks = marks;
		});
		return null;
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
	 * Describe an assessment objective for the report's By skill strip. A blank
	 * description clears it. Display only: reports are written without it, so it
	 * leaves every report current. Like every breakdown edit, it is locked once
	 * the breakdown is confirmed.
	 */
	setAoDescription(ao: AssessmentObjective, description: string): void {
		const document = this.#editable();
		if (!document) return;
		applyAoDescription(document.aoDescriptions, ao, description);
		this.#mutated();
	}

	/**
	 * Insert an entry the parse missed below the entry named, on that entry's
	 * tier, and hand back its id. It joins the question of the row it follows,
	 * and carries nothing else: a blank label and no marks stop it being mistaken
	 * for something the parse found.
	 */
	insertEntryAfter(entryId: string): string | null {
		const document = this.#editable();
		if (!document) return null;

		const id = insertEntryAfter(document, entryId);
		if (id !== null) this.#mutated();
		return id;
	}

	/**
	 * Add an entry at the end of one tier's breakdown, and hand back its id. It
	 * is a question of its own for the teacher to number — the paper's last
	 * question is the one a parse most often misses — so numbering it moves no
	 * other row.
	 */
	appendEntry(tier: TierIndex): string | null {
		const document = this.#editable();
		if (!document) return null;

		const id = appendEntry(document, tier);
		if (id !== null) this.#mutated();
		return id;
	}

	/**
	 * Delete an entry, leaving it — and what was recorded against it, its
	 * findings and any common question it belonged to — one undo away.
	 */
	deleteEntry(entryId: string): boolean {
		if (!this.#editable()) return false;
		return this.#commit((document) => {
			const name = removeEntry(document, entryId);
			return name === null ? null : { kind: 'entry-removal', name };
		});
	}

	/**
	 * Put a pair of entries on the two tiers, change an entry's partner, or clear
	 * it. Both entries must exist on different tiers and carry the same known
	 * marks, and a partner already paired elsewhere is refused. Clearing touches
	 * no marks; the breakdown's confirmation locks all three.
	 */
	setCommonQuestion(tier: TierIndex, entryId: string, partnerId: string | null): void {
		const document = this.#editable();
		if (!document) return;
		const pairs = commonQuestionsAfter(document, tier, entryId, partnerId);
		if (pairs === null) return;
		this.#commit((commitDocument) => {
			commitDocument.commonQuestions = pairs;
			return { kind: 'common-question' };
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

		this.document = withChangeUndone(document, undoable);
		this.#mutated();
		return true;
	}

	/** Move an entry one place up or down, to put the columns in the paper's order. */
	moveEntry(entryId: string, offset: -1 | 1): boolean {
		const document = this.#editable();
		if (!document) return false;

		if (!moveEntry(document, entryId, offset)) return false;
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

		const student = newStudent(name, restingTier(document));
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

	/**
	 * Put a student on one tier, or (on two tiers) back to no tier at all. Marks
	 * on the tier they leave are kept; they count again if the student returns.
	 * A tier the assessment does not have, or no tier on a single-tier
	 * assessment, is refused: no document is ever left in an unreadable shape.
	 */
	setStudentTier(studentId: string, tier: TierIndex | null): boolean {
		return this.setStudentsTier([studentId], tier);
	}

	/**
	 * Place several students on one tier in a single undoable change: choosing
	 * a group and a tier is one action to the teacher, so it is one to undo.
	 */
	setStudentsTier(studentIds: readonly string[], tier: TierIndex | null): boolean {
		const document = this.document;
		if (!document || !isTierTarget(document, tier)) return false;
		return this.#commit((commitDocument) => placeStudents(commitDocument, studentIds, tier));
	}

	/** Remove a student, taking their marks with them, one undo away. */
	removeStudent(studentId: string): boolean {
		return this.#commit((document) => removeStudent(document, studentId));
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
	 * A tier of null is the resting place for a new student: tier 0 on a single
	 * tier, no tier on two, where the teacher places them afterward. Marks have
	 * nowhere to go without a tier, so a block carrying them is refused whole
	 * and nothing is added.
	 */
	pasteNames(names: string, tier: TierIndex | null): number {
		const document = this.document;
		if (!document) return 0;
		const target = tier ?? restingTier(document);
		if (target === null) {
			const rows = trimPasteGrid(textGrid(names));
			if (rows.some((row) => row.length > 1)) {
				this.pasteNotice = null;
				this.pasteRefusal =
					'Nothing was pasted: marks need a tier. Put the class on a tier first, then paste them again.';
				return 0;
			}
			return this.#addNamesWithoutTier(rows);
		}
		if (document.tiers[target] === undefined) return 0;
		return this.pasteMarks(textGrid(names), { kind: 'names', studentId: null }, target)
			.studentsAdded;
	}

	/** Add a pasted class list with no marks: students on no tier, for the teacher to place. */
	#addNamesWithoutTier(rows: readonly (readonly string[])[]): number {
		this.pasteRefusal = null;
		let result = emptyPasteResult();
		this.#commit((document) => {
			result = addUnplacedStudents(document, rows);
			return result.changed ? { kind: 'mark-paste' } : null;
		});
		this.pasteNotice = result.changed ? result : null;
		return result.studentsAdded;
	}

	/**
	 * Add the students an uploaded class list names to the end of the class,
	 * skipping those the class already has, and keep the account of it for the
	 * notice beside the grid. One undo takes the whole upload back. A tier of
	 * null follows the same resting place as a new student.
	 */
	addStudentsFromUpload(names: readonly StudentName[], tier: TierIndex | null): void {
		const document = this.document;
		if (!document) return;
		const target = tier ?? restingTier(document);
		if (target !== null && document.tiers[target] === undefined) return;

		let result = emptyPasteResult();
		this.#commit((commitDocument) => {
			result = addUploadedStudents(commitDocument, names, target);
			return result.changed ? { kind: 'mark-paste' } : null;
		});
		this.pasteNotice = result.changed ? result : null;
	}

	/**
	 * Record the mark one student gained on one entry. Whole numbers only, and
	 * never clamped to the entry's available marks: a typo is stored and flagged
	 * rather than quietly rewritten into a mark the teacher never gave. Zero is a
	 * mark; a cell with none is not in the map at all. A refused mark is returned
	 * for the cell's notice to show.
	 */
	setMark(studentId: string, entryId: string, mark: number): string | null {
		if (!Number.isInteger(mark) || mark < 0) return MARK_REFUSAL;
		const document = this.#markable(studentId, entryId);
		if (!document) return null;
		// The mark already there is not a change: re-entering it must not spend the
		// undo the teacher still wants, or bump the document's timestamp.
		if (!putMark(document.marks, studentId, entryId, mark)) return null;
		this.#mutated();
		return null;
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
	pasteMarks(
		rows: readonly (readonly string[])[],
		anchor: PasteAnchor,
		tier: TierIndex
	): PasteResult {
		const document = this.document;
		if (!document || document.tiers[tier] === undefined) return emptyPasteResult();
		this.pasteRefusal = null;

		// The snapshot is taken before the first cell lands: undo puts back the
		// document exactly as the teacher had it, added students included.
		let result = emptyPasteResult();
		this.#commit((commitDocument) => {
			result = applyPaste(commitDocument, rows, anchor, tier);
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
	 * Confirm the breakdowns and the pairs unless something blocks the marksheet
	 * they would build: an entry with no marks or no unique label, two tiers with
	 * blank or identical names, or a pair with unequal marks. Returns whether the
	 * assessment is confirmed, changing nothing when it is not.
	 */
	confirmBreakdown(): boolean {
		const document = this.document;
		if (!document) return false;
		if (document.breakdownConfirmedAt !== null) return true;
		if (assessmentBlockers(document).blocked) return false;

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

	/** Another tab changed storage under `key` (`null` when it was all cleared): this tab may now be stale. */
	storageChangedElsewhere(key: string | null): void {
		this.#persistence.changedElsewhere(key);
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
		document.firstUnbackedChangeAt = null;
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
	 * Save one tier's grade boundaries: the kept rows top grade first, with blank
	 * and unawarded rows left out, and the below-lowest label. One undo takes the
	 * save back, like every other marksheet change.
	 */
	saveBoundaries(
		tier: TierIndex,
		boundaries: { label: string; minimum: number }[],
		belowLowestLabel: string
	): void {
		this.#commit((document) => {
			if (document.tiers[tier] === undefined) return null;
			setBoundaries(document, tier, boundaries, belowLowestLabel);
			return { kind: 'grade-boundaries', action: 'saved' };
		});
	}

	/** Drop every boundary on one tier, back to marks only, one undo away. */
	removeBoundaries(tier: TierIndex): void {
		this.#commit((document) =>
			clearBoundaries(document, tier) ? { kind: 'grade-boundaries', action: 'removed' } : null
		);
	}

	/**
	 * Adopt a document read from a backup file, and say whether it was taken —
	 * not when this browser already holds a document (replacing one is the
	 * new-upload dialog's job, with its account of the loss), in which case the
	 * app is left exactly as it was. Unreachable marks are dropped on the way
	 * in, exactly as they would be on the next boot, and the document reaches
	 * storage at once rather than on the debounce: it is the teacher's only copy
	 * until they back up again. The file is a backup, so whatever change it
	 * records as unbacked is held by the copy being restored.
	 */
	restoreBackup(document: MarksheetDocument): boolean {
		if (this.document) return false;
		this.#adopt({ ...dropUnreachable(document), firstUnbackedChangeAt: null });
		this.#persistence.writeNow();
		return true;
	}

	/** New upload: discard the marksheet document and nothing else. */
	wipe(): void {
		this.#persistence.clear();
		this.#adopt(null);
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
		if (entryTierOf(document, entryId) === null) return null;
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
			const tier = entryTierOf(document, entryId);
			if (tier === null) continue;
			const entry = document.tiers[tier].breakdown.entries.find(
				(candidate) => candidate.id === entryId
			);
			if (entry === undefined) continue;
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
		this.pasteRefusal = null;
		this.unreadable = null;
		this.runUsage = null;
		this.matchNotice = null;
		this.backupNudgeShown = false;
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
		this.pasteRefusal = null;
		const at = this.#now().toISOString();
		document.updatedAt = at;
		// The first change after a backup starts the clock on what a backup would
		// save; later changes leave that moment where it is.
		if (document.lastExportedAt !== null && document.firstUnbackedChangeAt === null) {
			document.firstUnbackedChangeAt = at;
		}
		this.#persistence.changed();
	}
}
