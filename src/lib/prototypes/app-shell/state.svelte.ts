// PROTOTYPE — throwaway in-memory state for wayfinder #30 (app shell, nav, destructive-action dialogs).
// Nothing here touches localStorage: the stored document is stubbed so every shell state can be
// reached from the prototype controls. Lives on branch prototype/app-shell only.
// Dates here are only ever replaced wholesale on $state fields, never mutated in place.
/* eslint-disable svelte/prefer-svelte-reactivity */

export type Surface = 'upload' | 'breakdown' | 'marksheet';
export type SaveState = 'saved' | 'saving' | 'failed' | 'unavailable';
export type DialogCaller = 'new-upload' | 'restore' | null;

export interface DocFacts {
	paperLabel: string;
	className: string;
	students: number;
	entries: number;
	marksEntered: number;
	breakdownConfirmedAt: Date | null;
	lastExportedAt: Date | null;
	warnings: number;
}

export interface Scenario {
	key: string;
	label: string;
	surface: Surface;
	doc: DocFacts | null;
}

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const base: DocFacts = {
	paperLabel: 'AQA GCSE Physics P1 — Nov mock',
	className: '11X/Ph1',
	students: 28,
	entries: 32,
	marksEntered: 612,
	breakdownConfirmedAt: ago(9 * DAY),
	lastExportedAt: ago(3 * DAY),
	warnings: 2
};

export const SCENARIOS: Scenario[] = [
	{ key: 'empty', label: 'Empty (upload)', surface: 'upload', doc: null },
	{
		key: 'review',
		label: 'Unconfirmed breakdown',
		surface: 'breakdown',
		doc: {
			...base,
			className: '',
			students: 0,
			marksEntered: 0,
			breakdownConfirmedAt: null,
			lastExportedAt: null
		}
	},
	{
		key: 'fresh',
		label: 'Marksheet, no marks yet',
		surface: 'marksheet',
		doc: { ...base, marksEntered: 0, lastExportedAt: null }
	},
	{ key: 'ok', label: 'Backed up 3 days ago', surface: 'marksheet', doc: { ...base } },
	{
		key: 'never',
		label: 'Marks, never backed up',
		surface: 'marksheet',
		doc: { ...base, lastExportedAt: null }
	},
	{
		key: 'stale',
		label: 'Backed up 9 days ago',
		surface: 'marksheet',
		doc: { ...base, lastExportedAt: ago(9 * DAY) }
	}
];

/** The backup file the stubbed "Restore from backup" picker hands back. */
export const INCOMING_BACKUP: DocFacts = {
	...base,
	paperLabel: 'Edexcel GCSE Chemistry P2 — June',
	className: '10Y/Ch2',
	students: 26,
	entries: 27,
	marksEntered: 702,
	lastExportedAt: ago(2 * DAY)
};

export const SAVE_STATES: SaveState[] = ['saved', 'saving', 'failed', 'unavailable'];

export function relative(d: Date | null, now: number): string {
	if (!d) return 'never';
	const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
	if (s < 10) return 'just now';
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	const days = Math.round(h / 24);
	return days === 1 ? 'yesterday' : `${days} days ago`;
}

export class Shell {
	scenario = $state('ok');
	surface = $state<Surface>('marksheet');
	doc = $state<DocFacts | null>(null);
	save = $state<SaveState>('saved');
	lastSavedAt = $state(new Date(Date.now() - 12_000));
	bannerDismissed = $state(false);
	dialog = $state<DialogCaller>(null);
	/** True once a backup was downloaded from inside the currently open dialog. */
	backedUpInDialog = $state(false);
	now = $state(Date.now());
	log = $state<string[]>([]);

	constructor() {
		this.load('ok');
		setInterval(() => (this.now = Date.now()), 1000);
	}

	load(key: string) {
		const s = SCENARIOS.find((x) => x.key === key) ?? SCENARIOS[0];
		this.scenario = s.key;
		this.surface = s.surface;
		this.doc = s.doc ? { ...s.doc } : null;
		this.save = 'saved';
		this.lastSavedAt = new Date(Date.now() - 12_000);
		this.bannerDismissed = false;
		this.dialog = null;
		this.note(`scenario → ${s.label}`);
	}

	note(line: string) {
		this.log = [`${new Date().toLocaleTimeString()} ${line}`, ...this.log].slice(0, 20);
	}

	/** never-exported-with-marks, or last backup older than 7 days (#26). */
	get stale(): boolean {
		if (!this.doc) return false;
		const { lastExportedAt, marksEntered } = this.doc;
		if (!lastExportedAt) return marksEntered > 0;
		return this.now - lastExportedAt.getTime() > 7 * DAY;
	}

	get showBanner(): boolean {
		return this.surface === 'marksheet' && this.stale && !this.bannerDismissed;
	}

	get savedAgo(): string {
		return relative(this.lastSavedAt, this.now);
	}

	get backupAgo(): string {
		return relative(this.doc?.lastExportedAt ?? null, this.now);
	}

	get backupDays(): number | null {
		const d = this.doc?.lastExportedAt;
		return d ? Math.floor((this.now - d.getTime()) / DAY) : null;
	}

	/** Simulate a cell edit: debounced autosave then settled. */
	edit() {
		if (!this.doc) return;
		this.doc.marksEntered += 1;
		if (this.save === 'unavailable' || this.save === 'failed') {
			this.note(`edit — save state stays ${this.save}`);
			return;
		}
		this.save = 'saving';
		setTimeout(() => {
			if (this.save !== 'saving') return;
			this.save = 'saved';
			this.lastSavedAt = new Date();
		}, 900);
	}

	cycleSave() {
		this.save = SAVE_STATES[(SAVE_STATES.indexOf(this.save) + 1) % SAVE_STATES.length];
		if (this.save === 'saved') this.lastSavedAt = new Date();
	}

	/** The #25 saved-state line, in short (pill) and long (sentence) forms. */
	get saveLine(): { tone: 'ok' | 'busy' | 'error' | 'warn'; short: string; long: string } {
		switch (this.save) {
			case 'saved':
				return { tone: 'ok', short: 'Saved', long: `All changes saved · ${this.savedAgo}` };
			case 'saving':
				return { tone: 'busy', short: 'Saving…', long: 'Saving…' };
			case 'failed':
				return {
					tone: 'error',
					short: 'Not saved',
					long: `Couldn't save — changes since ${this.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} are only in this tab`
				};
			case 'unavailable':
				return {
					tone: 'warn',
					short: 'Not stored',
					long: "This browser isn't keeping anything — marks are lost when the tab closes"
				};
		}
	}

	downloadBackup(from: string) {
		if (!this.doc) return;
		this.doc.lastExportedAt = new Date();
		if (this.dialog) this.backedUpInDialog = true;
		this.note(`[${from}] would download backup of "${this.doc.paperLabel}" (.json)`);
	}

	exportMarks(from: string) {
		if (!this.doc) return;
		// A marks export is lossy and does NOT restore, so it never counts as a backup.
		this.note(`[${from}] would download marks of "${this.doc.paperLabel}" (.csv, not a backup)`);
	}

	open(caller: DialogCaller) {
		this.backedUpInDialog = false;
		this.dialog = caller;
		this.note(`dialog → ${caller}`);
	}

	close() {
		this.dialog = null;
	}

	wipe() {
		this.note('wipe qla:marksheet:v1 → /');
		this.dialog = null;
		this.doc = null;
		this.surface = 'upload';
		this.bannerDismissed = false;
	}

	restore() {
		this.note('restore backup → /marksheet');
		this.dialog = null;
		this.doc = { ...INCOMING_BACKUP };
		this.surface = 'marksheet';
		this.save = 'saved';
		this.lastSavedAt = new Date();
	}

	confirmBreakdown() {
		if (!this.doc) return;
		this.doc.breakdownConfirmedAt = new Date();
		this.surface = 'marksheet';
		this.note('breakdown confirmed → /marksheet');
	}

	parse() {
		this.doc = {
			...base,
			className: '',
			students: 0,
			marksEntered: 0,
			breakdownConfirmedAt: null,
			lastExportedAt: null
		};
		this.surface = 'breakdown';
		this.note('parse ok, stored → /breakdown');
	}
}
