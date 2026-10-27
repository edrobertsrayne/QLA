// PROTOTYPE (#159) — the state the topic-facility variants share: which
// assessment is on screen and which pooling rules are in force. In-memory only;
// nothing here touches the marksheet store or localStorage.

import { FIXTURES, type PrototypeFixture } from './fixtures.js';
import type { TopicRules } from './topic-rows.js';

export type SortOrder = 'paper' | 'weakest';

const model = $state({
	fixture: 'single',
	rules: {
		tierScope: 'per-tier',
		aoRows: 'separate',
		multiSpec: 'each',
		order: 'weakest'
	} as TopicRules,
	sort: 'paper' as SortOrder
});

export function topicPrototype(): typeof model {
	return model;
}

/** The assessment on screen, as its fixture carries it. */
export function currentFixture(): PrototypeFixture {
	return FIXTURES.find((fixture) => fixture.key === model.fixture) ?? FIXTURES[0];
}
