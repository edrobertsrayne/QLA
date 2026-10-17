import { describe, expect, it } from 'vitest';
import { flushOnHide } from './flush.js';
import type { PageLifecycle } from './flush.js';

interface FakeLifecycle extends PageLifecycle {
	hide(): void;
	fire(type: 'visibilitychange' | 'pagehide'): void;
}

function fakeLifecycle(): FakeLifecycle {
	const listeners: Record<string, (() => void)[]> = { visibilitychange: [], pagehide: [] };
	let hidden = false;
	return {
		isHidden: () => hidden,
		on: (type, listener) => {
			listeners[type].push(listener);
		},
		hide: () => {
			hidden = true;
		},
		fire: (type) => {
			for (const listener of listeners[type]) listener();
		}
	};
}

describe('flushOnHide', () => {
	it('writes pending changes when the tab is hidden', () => {
		const lifecycle = fakeLifecycle();
		let flushes = 0;
		flushOnHide(() => {
			flushes += 1;
		}, lifecycle);

		lifecycle.fire('visibilitychange');
		expect(flushes).toBe(0);

		lifecycle.hide();
		lifecycle.fire('visibilitychange');

		expect(flushes).toBe(1);
	});

	it('writes pending changes when the page is going away', () => {
		const lifecycle = fakeLifecycle();
		let flushes = 0;
		flushOnHide(() => {
			flushes += 1;
		}, lifecycle);

		lifecycle.fire('pagehide');

		expect(flushes).toBe(1);
	});
});
