// PROTOTYPE (#93), throwaway: fake backup state shared by the five backup-control
// variants on /marksheet?variant=A..E. In memory only; nothing is stored, and
// "Back up now" never downloads a file. The real rules belong to #90.

import { dev } from '$app/environment';
import { page } from '$app/state';
import { toast } from 'svelte-sonner';
import { relativeTime } from '$lib/marksheet/status.js';

export const VARIANTS = [
	{ key: 'A', name: 'Header card' },
	{ key: 'B', name: 'Grid toolbar' },
	{ key: 'C', name: 'Status bar' },
	{ key: 'D', name: 'Heading meta line' },
	{ key: 'E', name: 'App nav' }
] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];

/** The variant on screen, or null outside dev or off the marksheet. */
export function protoVariant(): VariantKey | null {
	if (!dev || page.url.pathname !== '/marksheet') return null;
	const key = page.url.searchParams.get('variant');
	return VARIANTS.find((v) => v.key === key)?.key ?? null;
}

export type Preset = 'clean' | 'unbacked' | 'overdue' | 'never';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number): Date => new Date(Date.now() - ms);

export const PRESETS: Record<
	Preset,
	{ label: string; backedUpAt: () => Date | null; firstChangeAt: () => Date | null }
> = {
	clean: {
		label: 'Backed up, nothing new (disabled)',
		backedUpAt: () => ago(3 * DAY),
		firstChangeAt: () => null
	},
	unbacked: {
		label: 'Changes since backup (enabled)',
		backedUpAt: () => ago(3 * DAY),
		firstChangeAt: () => ago(4 * HOUR)
	},
	overdue: {
		label: 'Changes >2 days old (enabled + toast)',
		backedUpAt: () => ago(5 * DAY),
		firstChangeAt: () => ago(3 * DAY)
	},
	never: {
		label: 'Never backed up (enabled)',
		backedUpAt: () => null,
		firstChangeAt: () => ago(1 * DAY)
	}
};

class BackupProto {
	backedUpAt = $state<Date | null>(PRESETS.unbacked.backedUpAt());
	firstChangeAt = $state<Date | null>(PRESETS.unbacked.firstChangeAt());
	toastShown = $state(false);

	/** The button's one rule from #90: enabled with changes since a backup, or with none ever taken. */
	enabled = $derived(this.backedUpAt === null || this.firstChangeAt !== null);
	never = $derived(this.backedUpAt === null);
	age = $derived(this.backedUpAt === null ? 'None yet' : relativeTime(this.backedUpAt, new Date()));
	changedAge = $derived(
		this.firstChangeAt === null ? null : relativeTime(this.firstChangeAt, new Date())
	);
	overdue = $derived(
		this.firstChangeAt !== null && Date.now() - this.firstChangeAt.getTime() > 2 * DAY
	);

	apply(preset: Preset): void {
		this.backedUpAt = PRESETS[preset].backedUpAt();
		this.firstChangeAt = PRESETS[preset].firstChangeAt();
		this.toastShown = false;
		if (this.overdue) this.showToast();
	}

	/** Stub of a mutation: the first one after a backup starts the clock. */
	change(): void {
		this.firstChangeAt ??= new Date();
	}

	/** Stub of backUpNow: no file, just the state a backup leaves. */
	backUp(): void {
		this.backedUpAt = new Date();
		this.firstChangeAt = null;
		toast.dismiss('backup-nudge');
	}

	showToast(): void {
		this.toastShown = true;
		const days = this.firstChangeAt
			? Math.floor((Date.now() - this.firstChangeAt.getTime()) / DAY)
			: 0;
		toast(`Changes from ${days} days ago aren't backed up`, {
			id: 'backup-nudge',
			description: 'A backup file is the only copy that survives the browser clearing its storage.',
			duration: 15000,
			action: { label: 'Back up now', onClick: () => this.backUp() }
		});
	}
}

export const proto = new BackupProto();
