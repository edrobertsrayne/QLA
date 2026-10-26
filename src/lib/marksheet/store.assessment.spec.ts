import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryEdits } from './breakdown.js';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from './document.js';
import { parseRun, parsed, question, tierParse } from './fixtures.spec-helpers.js';
import { NOW, fakeStorage, refusingWrites, stored, storeWith } from './store.spec-helpers.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createFromAssessment', () => {
	it('asks the browser to keep the document when it is first stored', () => {
		const persist = vi.fn(async () => true);
		vi.stubGlobal('navigator', { storage: { persist } });
		const store = storeWith(fakeStorage());

		store.createFromAssessment(parseRun());

		expect(persist).toHaveBeenCalledTimes(1);
	});

	const input = parseRun({
		tiers: [
			tierParse({
				tierName: '  Higher ',
				breakdown: {
					tierName: '  Higher ',
					questions: [
						question({
							id: '1a',
							questionNumber: '1',
							marks: 2,
							summary: 'Explain the process shown',
							specPoint: null,
							commandWord: 'Explain',
							ao: 'AO1'
						}),
						question({ ao: null })
					],
					aoDescriptions: []
				},
				warnings: [
					{ questionId: '2bii', code: 'SUMMARY_LENGTH', message: '2 words; expected 3–8 words.' },
					{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
				],
				filenames: ['paper.pdf', 'markscheme.pdf']
			})
		],
		usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 }
	});

	it('stores the descriptions the parse found and skips the objectives it left null', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromAssessment({
			...input,
			tiers: [
				tierParse({
					tierName: 'Higher',
					breakdown: {
						tierName: 'Higher',
						questions: [question()],
						aoDescriptions: [
							{ ao: 'AO1', description: 'Demonstrate knowledge and understanding' },
							{ ao: 'AO2', description: null },
							{ ao: 'AO3', description: '  ' }
						]
					}
				})
			]
		});

		expect(stored(storage).aoDescriptions).toEqual({
			AO1: 'Demonstrate knowledge and understanding'
		});
	});

	it('keeps Tier 1’s description and fills its gaps from Tier 2', () => {
		const storage = fakeStorage();
		storeWith(storage).createFromAssessment({
			...input,
			tiers: [
				tierParse({
					tierName: 'Higher',
					breakdown: {
						tierName: 'Higher',
						questions: [question()],
						aoDescriptions: [
							{ ao: 'AO1', description: 'Tier 1 wording' },
							{ ao: 'AO2', description: '   ' }
						]
					}
				}),
				tierParse({
					tierName: 'Foundation',
					breakdown: {
						tierName: 'Foundation',
						questions: [question()],
						aoDescriptions: [
							{ ao: 'AO1', description: 'Tier 2 wording' },
							{ ao: 'AO2', description: 'Tier 2 fills the gap' }
						]
					}
				})
			]
		});

		expect(stored(storage).aoDescriptions).toEqual({
			AO1: 'Tier 1 wording',
			AO2: 'Tier 2 fills the gap'
		});
	});

	it('writes an unconfirmed single-tier document with generated entry ids and re-keyed warnings', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromAssessment(input);

		const written = stored(storage);
		expect(written.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(written.breakdownConfirmedAt).toBeNull();
		expect(written.lastExportedAt).toBeNull();
		expect(written.createdAt).toBe(NOW.toISOString());
		expect(written.updatedAt).toBe(NOW.toISOString());
		expect(written.label).toBe('paper');
		expect(written.className).toBeNull();
		expect(written.tiers).toHaveLength(1);
		expect(written.tiers[0]).toMatchObject({
			tierName: 'Higher',
			sourceFilenames: ['paper.pdf', 'markscheme.pdf'],
			parsedAt: NOW.toISOString(),
			boundaries: null,
			belowLowestLabel: 'U'
		});
		expect(written.students).toEqual([]);
		expect(written.marks).toEqual({});
		expect(written.commonQuestions).toEqual([]);
		expect(written.topicNames).toEqual({});
		expect(written.reports).toEqual({});

		const entries = written.tiers[0].breakdown.entries;
		expect(entries.map((entry) => entry.label)).toEqual(['1a', '2bii']);
		expect(entries.map((entry) => entry.questionNumber)).toEqual(['1', '2']);
		expect(entries.map((entry) => entry.marks)).toEqual([2, 4]);
		expect(entries.map((entry) => entry.ao)).toEqual(['AO1', null]);
		const ids = entries.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(2);
		for (const [index, id] of ids.entries()) {
			expect(id).not.toBe('');
			expect(id).not.toBe(entries[index].label);
		}

		expect(written.tiers[0].breakdown.warnings).toEqual([
			{ questionId: ids[1], code: 'SUMMARY_LENGTH', message: '2 words; expected 3–8 words.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
		]);

		expect(storage.getItem(STORAGE_KEY)).not.toContain('promptTokens');
	});

	it('writes both tiers, their names and the label Tier 1 chooses', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromAssessment({
			...input,
			tiers: [
				tierParse({
					tierName: '  Higher Tier ',
					breakdown: {
						tierName: '  Higher Tier ',
						questions: [question({ id: '1a' })],
						aoDescriptions: []
					},
					warnings: [],
					filenames: ['higher-paper.pdf']
				}),
				tierParse({
					tierName: 'Foundation',
					breakdown: {
						tierName: 'Foundation',
						questions: [question({ id: '1a', marks: 4 })],
						aoDescriptions: []
					},
					warnings: [{ questionId: '1a', code: 'SUMMARY_LENGTH', message: 'Two words.' }],
					filenames: ['foundation-paper.pdf']
				})
			]
		});

		const written = stored(storage);
		expect(written.label).toBe('higher-paper');
		expect(written.tiers.map((one) => one.tierName)).toEqual(['Higher Tier', 'Foundation']);
		expect(written.tiers.map((one) => one.sourceFilenames)).toEqual([
			['higher-paper.pdf'],
			['foundation-paper.pdf']
		]);
		expect(written.tiers.map((one) => one.breakdown.entries.length)).toEqual([1, 1]);
		// Identical labels across tiers are not pairs: only the match call proposes them.
		expect(written.commonQuestions).toEqual([]);
		const secondEntry = written.tiers[1].breakdown.entries[0];
		expect(written.tiers[1].breakdown.warnings).toEqual([
			{ questionId: secondEntry.id, code: 'SUMMARY_LENGTH', message: 'Two words.' }
		]);
	});

	it('maps proposed labels to entry ids, dropping unknown, duplicated, unequal, null and reused pairs', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromAssessment({
			...input,
			tiers: [
				tierParse({
					tierName: 'Higher',
					breakdown: {
						tierName: 'Higher',
						questions: [
							question({ id: '1a' }),
							question({ id: '1b' }),
							question({ id: 'dup' }),
							question({ id: 'dup' })
						],
						aoDescriptions: []
					}
				}),
				tierParse({
					tierName: 'Foundation',
					breakdown: {
						tierName: 'Foundation',
						questions: [
							question({ id: '1a' }),
							question({ id: '1b', marks: 3 }),
							question({ id: '1c', marks: null }),
							question({ id: '2a' })
						],
						aoDescriptions: []
					}
				})
			],
			pairs: [
				{ tier1Id: '1a', tier2Id: '1a' },
				{ tier1Id: '1b', tier2Id: '1c' },
				{ tier1Id: '1b', tier2Id: '1b' },
				{ tier1Id: 'dup', tier2Id: '2a' },
				{ tier1Id: 'missing', tier2Id: '2a' },
				{ tier1Id: '1a', tier2Id: '2a' },
				{ tier1Id: '1b', tier2Id: '2a' }
			]
		});

		const written = stored(storage);
		const firstEntries = written.tiers[0].breakdown.entries;
		const secondEntries = written.tiers[1].breakdown.entries;
		const firstA = firstEntries.find((one) => one.label === '1a');
		const firstB = firstEntries.find((one) => one.label === '1b');
		const secondA = secondEntries.find((one) => one.label === '1a');
		const secondTwoA = secondEntries.find((one) => one.label === '2a');
		if (!firstA || !firstB || !secondA || !secondTwoA) throw new Error('expected entries');

		expect(written.commonQuestions).toEqual([
			{ tier1EntryId: firstA.id, tier2EntryId: secondA.id },
			{ tier1EntryId: firstB.id, tier2EntryId: secondTwoA.id }
		]);
	});

	it("records the parse's own values with each entry, so an edit shows as a difference", () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromAssessment(input);

		const written = stored(storage);
		expect(written.tiers[0].breakdown.entries.map((entry) => entry.original)).toEqual([
			{
				label: '1a',
				questionNumber: '1',
				marks: 2,
				summary: 'Explain the process shown',
				specPoint: null,
				commandWord: 'Explain',
				ao: 'AO1'
			},
			{
				label: '2bii',
				questionNumber: '2',
				marks: 4,
				summary: 'Describe the rate change',
				specPoint: '3.2.1.4',
				commandWord: 'Describe',
				ao: null
			}
		]);

		const entryId = written.tiers[0].breakdown.entries[0]?.id;
		if (entryId === undefined) throw new Error('expected an entry');
		store.setEntryMarks(entryId, 5);
		const edited = store.document?.tiers[0].breakdown.entries[0];
		if (edited === undefined) throw new Error('expected the edited entry');
		expect(entryEdits(edited).fields).toEqual(['marks']);
	});

	it('keeps this run usage in memory only, and routes to the breakdown', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromAssessment(input);

		expect(store.runUsage).toEqual(input.usage);
		expect(storage.getItem(STORAGE_KEY)).not.toContain('promptTokens');
		expect(store.route()).toBe('/breakdown');
	});

	it('carries why matching proposed no pairs into the session, and clears it with the document', () => {
		const store = storeWith(fakeStorage());

		store.createFromAssessment({
			...input,
			matchNotice: 'None proposed: pair them by hand at review'
		});

		expect(store.matchNotice).toBe('None proposed: pair them by hand at review');

		store.wipe();

		expect(store.matchNotice).toBeNull();
	});

	it('has no matching notice for a run that proposed no pairs', () => {
		const store = storeWith(fakeStorage());

		store.createFromAssessment(input);

		expect(store.matchNotice).toBeNull();
	});

	it('is the first paint on reload: the same entries and ids come back', () => {
		const storage = fakeStorage();
		const first = storeWith(storage);
		first.createFromAssessment(input);

		const reloaded = storeWith(storage);
		reloaded.load();

		expect(reloaded.document?.tiers).toEqual(first.document?.tiers);
		const ids = reloaded.document?.tiers[0].breakdown.entries.map((entry) => entry.id) ?? [];
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
	});

	it('labels the paper after Tier 1’s first source filename', () => {
		const storage = fakeStorage();
		storeWith(storage).createFromAssessment({
			...input,
			tiers: [tierParse({ filenames: ['10X Ph1 2026.pdf'] })]
		});

		expect(stored(storage).label).toBe('10X Ph1 2026');
	});

	it('keeps a warning beside the table when its parse label is ambiguous', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);
		const duplicate = {
			...question(),
			id: '2bii',
			summary: 'Describe the rate change'
		};
		store.createFromAssessment({
			...input,
			tiers: [
				tierParse({
					breakdown: {
						tierName: null,
						questions: [question(), duplicate],
						aoDescriptions: []
					},
					warnings: [
						{ questionId: '2bii', code: 'DUPLICATE_ID', message: "Duplicate question id '2bii'." },
						{
							questionId: 'q[0]',
							code: 'EMPTY_ID',
							message: 'Entry q[0] has an empty question id.'
						}
					],
					filenames: ['paper.pdf']
				})
			]
		});

		const written = stored(storage);
		expect(written.tiers[0].breakdown.entries).toHaveLength(2);
		expect(written.tiers[0].breakdown.warnings).toEqual([
			{ questionId: null, code: 'DUPLICATE_ID', message: "Duplicate question id '2bii'." },
			{ questionId: null, code: 'EMPTY_ID', message: 'Entry q[0] has an empty question id.' }
		]);
	});

	it('leaves the label null when the run had no filename', () => {
		const storage = fakeStorage();
		storeWith(storage).createFromAssessment({
			...input,
			tiers: [tierParse({ filenames: [] })]
		});

		expect(stored(storage).label).toBeNull();
	});

	it('keeps working, and reporting unavailable, when the browser refuses writes', () => {
		const store = storeWith(refusingWrites(fakeStorage(), () => true, new Error('SecurityError')));
		store.load();

		store.createFromAssessment(input);

		expect(store.document?.tiers[0].breakdown.entries).toHaveLength(2);
		expect(store.route()).toBe('/breakdown');
		expect(store.saveState).toEqual({ kind: 'unavailable' });

		// The next route's gate must not re-read storage over an unsaved parse.
		store.load();

		expect(store.document?.tiers[0].breakdown.entries).toHaveLength(2);
		expect(store.route()).toBe('/breakdown');
	});

	it('keeps an unsaved parse in the tab when the write is refused', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(
			refusingWrites(storage, (key) => key === STORAGE_KEY, new Error('QuotaExceededError'))
		);
		store.load();

		store.createFromAssessment(input);
		expect(store.saveState.kind).toBe('failed');

		store.load();

		expect(store.document?.tiers[0].breakdown.entries.map((entry) => entry.label)).toEqual([
			'1a',
			'2bii'
		]);
		expect(store.route()).toBe('/breakdown');
	});
});
