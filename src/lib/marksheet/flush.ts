// Force an autosave before the page goes away.
//
// A debounced write loses the last few keystrokes when the tab is hidden or
// closed, so the store is flushed on both. The lifecycle is passed in rather
// than reached for, which keeps the rule testable without a browser.

export interface PageLifecycle {
	isHidden(): boolean;
	on(type: 'visibilitychange' | 'pagehide', listener: () => void): void;
}

export function flushOnHide(flush: () => void, lifecycle: PageLifecycle): void {
	lifecycle.on('visibilitychange', () => {
		if (lifecycle.isHidden()) flush();
	});
	lifecycle.on('pagehide', () => flush());
}
