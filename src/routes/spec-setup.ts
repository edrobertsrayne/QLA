// Setup for every browser spec: the router is a spy, and each test starts on
// a fresh surface. The store keeps changes the tab has not written, so a
// previous test's document is wiped rather than carried into the next one.
// Test-only: nothing in the app imports this.

import { beforeEach, vi } from 'vitest';
import { marksheetStore } from '$lib/marksheet/index.js';

const goto = vi.hoisted(() => vi.fn());

vi.mock('$app/navigation', () => ({ goto }));

beforeEach(() => {
	marksheetStore().wipe();
	localStorage.clear();
	goto.mockClear();
});
