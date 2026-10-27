// PROTOTYPE (#159) — the class's topic facility, with the pooling rules the
// maintainer is choosing between left switchable. Pure functions over a stored
// document: every figure is the real facility arithmetic — marks gained out of
// marks available over exactly the marks each entry's own facility index counts
// (that tier's students; not absent, not unmarked, not above the available
// marks). The page never computes; it calls in here. Once the verdict settles
// the rules, this module is what lifts into the real analysis.

import {
	analyseTier,
	facilityBand,
	type EntryAnalysis,
	type RagBand
} from '$lib/marksheet/analysis.js';
import { specPointCodes, type MarksheetDocument, type TierIndex } from '$lib/marksheet/document.js';

/** Q3: one tier's own figures only, or also both tiers pooled where both carry the topic. */
export type TierScope = 'per-tier' | 'pooled';
/** Q4: where the assessment-objective rows go. */
export type AoRows = 'mixed' | 'separate' | 'none';
/** Q5: a question carrying several specification points counts toward each, or splits its marks. */
export type MultiSpec = 'each' | 'split';
/** Q6: weakest first with unscored last, or paper order with a sort switch. */
export type RowOrder = 'weakest' | 'paper-switch';

export interface TopicRules {
	tierScope: TierScope;
	aoRows: AoRows;
	multiSpec: MultiSpec;
	order: RowOrder;
}

/** One breakdown entry behind a topic row. */
export interface TopicSource {
	entryId: string;
	label: string;
	summary: string;
	/** The marks counted into the row: the entry's own, or its share when the rule splits it. */
	gained: number;
	available: number;
	facility: number | null;
	partMarked: boolean;
	/** The entry's whole figures when the split rule gave the row only part of them. */
	splitFrom: { gained: number; available: number } | null;
}

/** Both tiers' marks pooled for a topic both tiers carry. */
export interface PooledTopic {
	gained: number;
	available: number;
	facility: number | null;
	band: RagBand | null;
}

/** What one specification point's or assessment objective's marks add up to. */
export interface TopicRow {
	kind: 'specification' | 'ao';
	/** The normalised specification code, or the assessment objective (AO1, …). */
	code: string;
	/** The teacher's topic name, or null when the topic has no name yet. */
	name: string | null;
	/** The AO description, or null for a specification point. */
	description: string | null;
	gained: number;
	available: number;
	/** Gained ÷ available, or null when no carrying question has a figure. */
	facility: number | null;
	band: RagBand | null;
	/** The figure rests on part of the class, as at least one question's own figure does. */
	partMarked: boolean;
	/** The questions carrying it, in the order the paper has them. */
	sources: TopicSource[];
	/** Both tiers' figure for a topic both tiers carry (Q3), or null. */
	pooled: PooledTopic | null;
}

interface Totals {
	kind: TopicRow['kind'];
	code: string;
	gained: number;
	available: number;
	partMarked: boolean;
	sources: TopicSource[];
}

/** One entry's contribution to one code, by the split rule. */
function share(
	row: EntryAnalysis,
	codes: number,
	rule: MultiSpec
): { gained: number; available: number } {
	if (rule === 'each' || codes <= 1) return { gained: row.gained, available: row.available };
	return { gained: row.gained / codes, available: row.available / codes };
}

/**
 * The topic rows for one tier, in the order the paper carries them. Q4 decides
 * whether the objective rows sit in the same list, get a list of their own (the
 * view splits on `kind`), or are left out.
 */
export function topicRows(
	document: MarksheetDocument,
	tier: TierIndex,
	rules: TopicRules
): TopicRow[] {
	const totals = new Map<string, Totals>();
	const add = (
		kind: TopicRow['kind'],
		code: string,
		gained: number,
		available: number,
		source: TopicSource
	): void => {
		const key = `${kind}:${code}`;
		const running = totals.get(key) ?? {
			kind,
			code,
			gained: 0,
			available: 0,
			partMarked: false,
			sources: []
		};
		running.gained += gained;
		running.available += available;
		running.partMarked ||= source.partMarked;
		running.sources.push(source);
		totals.set(key, running);
	};

	for (const row of analyseTier(document, tier).entries) {
		const codes = specPointCodes(row.entry.specPoint);
		for (const code of new Set(codes)) {
			const part = share(row, codes.length, rules.multiSpec);
			add('specification', code, part.gained, part.available, {
				entryId: row.entry.id,
				label: row.entry.label,
				summary: row.entry.summary,
				gained: part.gained,
				available: part.available,
				facility: row.facility,
				partMarked: row.coverage.partMarked,
				splitFrom:
					codes.length > 1 && rules.multiSpec === 'split'
						? { gained: row.gained, available: row.available }
						: null
			});
		}
		// The objective axis is separate: a split between specification points
		// never shrinks what the entry counts toward its objective.
		if (row.entry.ao !== null && rules.aoRows !== 'none') {
			add('ao', row.entry.ao, row.gained, row.available, {
				entryId: row.entry.id,
				label: row.entry.label,
				summary: row.entry.summary,
				gained: row.gained,
				available: row.available,
				facility: row.facility,
				partMarked: row.coverage.partMarked,
				splitFrom: null
			});
		}
	}

	return [...totals.values()].map((row) => {
		const facility = row.available > 0 ? row.gained / row.available : null;
		return {
			kind: row.kind,
			code: row.code,
			name: row.kind === 'ao' ? row.code : document.topicNames[row.code]?.trim() || null,
			description: row.kind === 'ao' ? (document.aoDescriptions[row.code as 'AO1'] ?? null) : null,
			gained: row.gained,
			available: row.available,
			facility,
			band: facility === null ? null : facilityBand(facility),
			partMarked: row.partMarked,
			sources: row.sources,
			pooled: null
		};
	});
}

/**
 * Both tiers' figure for every code both tiers carry, by the same rules one
 * tier's rows use (Q3): the pooled figure a teacher reads beside each tier's
 * own, exactly as a common question shows one.
 */
export function pooledTopics(
	document: MarksheetDocument,
	rules: TopicRules
): Map<string, PooledTopic> {
	const byKey = (tier: TierIndex): Map<string, TopicRow> =>
		new Map(topicRows(document, tier, rules).map((row) => [`${row.kind}:${row.code}`, row]));
	const tier1 = byKey(0);
	const pooled = new Map<string, PooledTopic>();
	for (const [key, row2] of byKey(1)) {
		const row1 = tier1.get(key);
		if (row1 === undefined) continue;
		const gained = row1.gained + row2.gained;
		const available = row1.available + row2.available;
		const facility = available > 0 ? gained / available : null;
		pooled.set(key, {
			gained,
			available,
			facility,
			band: facility === null ? null : facilityBand(facility)
		});
	}
	return pooled;
}

/** The order a teacher reads topic rows in: weakest first, with no figure last. */
export function weakestFirst(rows: readonly TopicRow[]): TopicRow[] {
	return [...rows].sort((a, b) => {
		if (a.facility === null && b.facility === null) return 0;
		if (a.facility === null) return 1;
		if (b.facility === null) return -1;
		return a.facility - b.facility;
	});
}

/**
 * The rows as the chosen rules leave them: pooled figures attached (Q3), and
 * ordered by Q6 — weakest first with unscored last, or the paper's own order.
 */
export function finishedRows(
	document: MarksheetDocument,
	tier: TierIndex,
	rules: TopicRules,
	sort: 'paper' | 'weakest'
): TopicRow[] {
	const rows = topicRows(document, tier, rules);
	const pooled = rules.tierScope === 'pooled' ? pooledTopics(document, rules) : null;
	const withPooled = rows.map((row) => ({
		...row,
		pooled: pooled?.get(`${row.kind}:${row.code}`) ?? null
	}));
	const ordered =
		rules.order === 'weakest' || sort === 'weakest' ? weakestFirst(withPooled) : withPooled;
	// AO rows ride along only where the rule keeps them in the same list.
	return rules.aoRows === 'mixed' ? ordered : ordered.filter((row) => row.kind === 'specification');
}

/** The objective rows on their own list (Q4), or none. */
export function aoRowsOf(
	document: MarksheetDocument,
	tier: TierIndex,
	rules: TopicRules,
	sort: 'paper' | 'weakest'
): TopicRow[] {
	if (rules.aoRows !== 'separate') return [];
	const all = topicRows(document, tier, rules).filter((row) => row.kind === 'ao');
	const pooled = rules.tierScope === 'pooled' ? pooledTopics(document, rules) : null;
	const withPooled = all.map((row) => ({
		...row,
		pooled: pooled?.get(`${row.kind}:${row.code}`) ?? null
	}));
	return rules.order === 'weakest' || sort === 'weakest' ? weakestFirst(withPooled) : withPooled;
}
