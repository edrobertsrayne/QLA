// PROTOTYPE (#113) — throwaway in-memory stand-in for a two-tier breakdown review.
// Nothing here touches the marksheet store or localStorage. Entry lists are the
// real gpt-6-luna parses of AQA 8463 Paper 1 Higher/Foundation (prototype #109 cache).
import higher from './8463-1H.json';
import foundation from './8463-1F.json';

export type Entry = {
	id: string;
	label: string;
	questionNumber: string;
	marks: number | null;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
	ao: string | null;
};

export type Tier = { tierName: string | null; filename: string; entries: Entry[] };
export type Pair = { tier1EntryId: string; tier2EntryId: string };
export type TierIndex = 0 | 1;

type RawEntry = Omit<Entry, 'label'> & { id: string };

export const SCENARIOS = [
	{ key: 'matched', label: 'Matched: 13 pairs proposed' },
	{ key: 'rough', label: 'Rough: 1 pair missed, Tier 2 name blank' },
	{ key: 'none', label: 'Matching failed: none proposed (notice)' },
	{ key: 'confirmed', label: 'Confirmed with marks (try unlocking)' }
] as const;
export type ScenarioKey = (typeof SCENARIOS)[number]['key'];

function toEntries(raw: RawEntry[], prefix: string): Entry[] {
	return raw.map((e) => ({ ...e, label: e.id, id: `${prefix}-${e.id}` }));
}

/** The true pairs in 8463 P1: Higher Q1–3 sit as Foundation Q8–10, part for part. */
function truePairs(): Pair[] {
	const h = higher as RawEntry[];
	const f = foundation as RawEntry[];
	const map: Record<string, string> = { '1': '08', '2': '09', '3': '10' };
	return h
		.filter((e) => Number(e.questionNumber) <= 3)
		.map((e) => {
			const fLabel = `${map[e.questionNumber]}.${e.id.split('.')[1]}`;
			return { tier1EntryId: `t1-${e.id}`, tier2EntryId: `t2-${fLabel}` };
		})
		.filter((p) => f.some((e) => `t2-${e.id}` === p.tier2EntryId));
}

class Review {
	scenario = $state<ScenarioKey>('matched');
	tiers = $state<Tier[]>([]);
	pairs = $state<Pair[]>([]);
	/** Shown when matching gave nothing back: the reason the run's notice named. */
	matchNotice = $state<string | null>(null);
	confirmedAt = $state<string | null>(null);
	/** True once the teacher came back here through "Unlock and edit". */
	unlockedFromMarksheet = $state(false);
	/** Fake marks on the marksheet, for the unlock warning. */
	studentsWithMarks = $state(0);
	lastChange = $state<string | null>(null);

	constructor() {
		this.load('matched');
	}

	load(key: ScenarioKey) {
		this.scenario = key;
		this.tiers = [
			{
				tierName: 'Higher',
				filename: '8463-1H-QP-JUN24.pdf',
				entries: toEntries(higher as RawEntry[], 't1')
			},
			{
				tierName: key === 'rough' ? null : 'Foundation',
				filename: '8463-1F-QP-JUN24.pdf',
				entries: toEntries(foundation as RawEntry[], 't2')
			}
		];
		const pairs = truePairs();
		this.pairs =
			key === 'none'
				? []
				: key === 'rough'
					? pairs.filter((p) => p.tier1EntryId !== 't1-03.5')
					: pairs;
		this.matchNotice =
			key === 'none'
				? 'Common questions couldn’t be found (the model refused the request), so none are proposed. Pair them by hand.'
				: null;
		this.confirmedAt = key === 'confirmed' ? '2026-10-20T09:12:00Z' : null;
		this.unlockedFromMarksheet = false;
		this.studentsWithMarks = key === 'confirmed' ? 24 : 0;
		this.lastChange = null;
	}

	get locked() {
		return this.confirmedAt !== null;
	}

	entry(tier: TierIndex, id: string): Entry | undefined {
		return this.tiers[tier].entries.find((e) => e.id === id);
	}

	/** The pair an entry is in, if any. */
	pairOf(tier: TierIndex, id: string): Pair | undefined {
		return this.pairs.find((p) => (tier === 0 ? p.tier1EntryId : p.tier2EntryId) === id);
	}

	partnerOf(tier: TierIndex, id: string): Entry | undefined {
		const pair = this.pairOf(tier, id);
		if (!pair) return undefined;
		return tier === 0 ? this.entry(1, pair.tier2EntryId) : this.entry(0, pair.tier1EntryId);
	}

	/**
	 * Who an entry may be paired with: the other tier's entries with the same
	 * (known) available marks that are free, plus its current partner.
	 */
	candidates(tier: TierIndex, id: string): Entry[] {
		const self = this.entry(tier, id);
		if (!self || self.marks === null) return [];
		const other: TierIndex = tier === 0 ? 1 : 0;
		const current = this.partnerOf(tier, id)?.id;
		return this.tiers[other].entries.filter(
			(e) => e.marks === self.marks && (e.id === current || !this.pairOf(other, e.id))
		);
	}

	/** Pair two entries, replacing whatever either was paired with before. */
	setPartner(tier: TierIndex, id: string, partnerId: string | null) {
		if (this.locked) return;
		const other: TierIndex = tier === 0 ? 1 : 0;
		this.pairs = this.pairs.filter(
			(p) =>
				(tier === 0 ? p.tier1EntryId : p.tier2EntryId) !== id &&
				(partnerId === null || (other === 0 ? p.tier1EntryId : p.tier2EntryId) !== partnerId)
		);
		if (partnerId !== null) {
			this.pairs.push(
				tier === 0
					? { tier1EntryId: id, tier2EntryId: partnerId }
					: { tier1EntryId: partnerId, tier2EntryId: id }
			);
		}
		const self = this.entry(tier, id)?.label;
		const partner = partnerId ? this.entry(other, partnerId)?.label : null;
		this.lastChange = partner
			? `Paired Tier ${tier + 1} ${self} ↔ Tier ${other + 1} ${partner}`
			: `Cleared pair on Tier ${tier + 1} ${self}`;
	}

	setTierName(tier: TierIndex, name: string) {
		if (this.locked) return;
		this.tiers[tier].tierName = name.trim() === '' ? null : name;
	}

	setMarks(tier: TierIndex, id: string, marks: number | null) {
		const e = this.entry(tier, id);
		if (!e || this.locked) return;
		e.marks = marks;
	}

	setField(tier: TierIndex, id: string, field: 'label' | 'summary', value: string) {
		const e = this.entry(tier, id);
		if (!e || this.locked) return;
		e[field] = value;
	}

	deleteEntry(tier: TierIndex, id: string) {
		if (this.locked) return;
		const had = this.partnerOf(tier, id);
		const label = this.entry(tier, id)?.label;
		this.tiers[tier].entries = this.tiers[tier].entries.filter((e) => e.id !== id);
		this.pairs = this.pairs.filter((p) => (tier === 0 ? p.tier1EntryId : p.tier2EntryId) !== id);
		this.lastChange = had
			? `Deleted Tier ${tier + 1} ${label}; its pair with ${had.label} went with it`
			: `Deleted Tier ${tier + 1} ${label}`;
	}

	/** Pairs in Tier 1's entry order (display order; the stored array has none). */
	get orderedPairs(): { pair: Pair; a: Entry; b: Entry }[] {
		return this.tiers[0].entries.flatMap((a) => {
			const pair = this.pairOf(0, a.id);
			const b = pair ? this.entry(1, pair.tier2EntryId) : undefined;
			return pair && b ? [{ pair, a, b }] : [];
		});
	}

	get pairedMarks(): number {
		return this.orderedPairs.reduce((sum, { a }) => sum + (a.marks ?? 0), 0);
	}

	tierMarks(tier: TierIndex): number {
		return this.tiers[tier].entries.reduce((sum, e) => sum + (e.marks ?? 0), 0);
	}

	tierLabel(tier: TierIndex): string {
		const name = this.tiers[tier].tierName;
		return name ? `Tier ${tier + 1} · ${name}` : `Tier ${tier + 1}`;
	}

	/** What stops confirming, per area, in the teacher's words. */
	get blockers(): { tier: TierIndex | 'pairs'; message: string }[] {
		const out: { tier: TierIndex | 'pairs'; message: string }[] = [];
		const [n1, n2] = this.tiers.map((t) => t.tierName?.trim() ?? '');
		if (n1 === '') out.push({ tier: 0, message: 'Tier 1 needs a tier name.' });
		if (n2 === '') out.push({ tier: 1, message: 'Tier 2 needs a tier name.' });
		if (n1 !== '' && n1.toLowerCase() === n2.toLowerCase())
			out.push({ tier: 1, message: 'The two tiers need different names.' });
		([0, 1] as TierIndex[]).forEach((t) => {
			const missing = this.tiers[t].entries.filter((e) => e.marks === null).map((e) => e.label);
			if (missing.length > 0)
				out.push({
					tier: t,
					message: `Tier ${t + 1}: no available marks on ${missing.join(', ')}.`
				});
		});
		for (const { a, b } of this.orderedPairs) {
			if (a.marks !== b.marks)
				out.push({
					tier: 'pairs',
					message: `${a.label} (${a.marks ?? '?'}) and ${b.label} (${b.marks ?? '?'}) are paired but have different available marks.`
				});
		}
		return out;
	}

	confirm() {
		if (this.blockers.length > 0) return;
		this.confirmedAt = new Date().toISOString();
		this.unlockedFromMarksheet = false;
		// Pretend marking happened, so the way back shows what an unlock puts at risk.
		this.studentsWithMarks = 24;
		this.lastChange = 'Confirmed: both breakdowns and the pairs are now read-only';
	}

	unlock() {
		this.confirmedAt = null;
		this.unlockedFromMarksheet = true;
		this.lastChange = 'Unlocked from the marksheet';
	}

	get snapshot() {
		return {
			scenario: this.scenario,
			confirmedAt: this.confirmedAt,
			unlockedFromMarksheet: this.unlockedFromMarksheet,
			tierNames: this.tiers.map((t) => t.tierName),
			entryCounts: this.tiers.map((t) => t.entries.length),
			commonQuestions: this.orderedPairs.map(({ a, b }) => `${a.label} ↔ ${b.label}`),
			blockers: this.blockers.map((b) => b.message),
			lastChange: this.lastChange
		};
	}
}

const review = new Review();

/** The one prototype review, shared by every variant and the stub panel. */
export function twoTierReview(): Review {
	return review;
}
