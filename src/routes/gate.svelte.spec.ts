import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { STORAGE_KEY } from '$lib/marksheet/document.js';
import { NOW, parsed, seed } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { load } from './+layout.js';
import BreakdownPage from './breakdown/+page.svelte';
import MarksheetPage from './marksheet/+page.svelte';
import UploadPage from './+page.svelte';

function redirectFrom(path: string): { status: number; location: string } | null {
	try {
		load({ url: new URL(path, 'http://localhost') });
		return null;
	} catch (error) {
		return error as { status: number; location: string };
	}
}

describe('boot gate', () => {
	it('lets every surface through when the stored state allows it', () => {
		expect(redirectFrom('/')).toBeNull();

		seed(parsed({ breakdownConfirmedAt: null }));
		expect(redirectFrom('/breakdown')).toBeNull();

		marksheetStore().wipe();
		seed(parsed({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom('/marksheet')).toBeNull();
	});

	it('sends a stored document from upload to the surface it allows', () => {
		seed(parsed({ breakdownConfirmedAt: null }));
		expect(redirectFrom('/')).toMatchObject({ status: 307, location: '/breakdown' });

		marksheetStore().wipe();
		seed(parsed({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom('/')).toMatchObject({ status: 307, location: '/marksheet' });
	});

	it('sends an unconfirmed breakdown to upload and to the marksheet away', () => {
		seed(parsed({ breakdownConfirmedAt: null }));
		expect(redirectFrom('/marksheet')).toMatchObject({ status: 307, location: '/breakdown' });
	});

	it('sends a confirmed breakdown on the breakdown route to the marksheet', () => {
		seed(parsed({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom('/breakdown')).toMatchObject({ status: 307, location: '/marksheet' });
	});

	it('keeps the report flow on a confirmed breakdown', () => {
		seed(parsed({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom('/reports')).toBeNull();
		expect(redirectFrom('/reports/review')).toBeNull();

		marksheetStore().wipe();
		seed(parsed({ breakdownConfirmedAt: null }));
		expect(redirectFrom('/reports')).toMatchObject({ status: 307, location: '/breakdown' });
		expect(redirectFrom('/reports/review')).toMatchObject({ status: 307, location: '/breakdown' });
	});

	it('keeps the analysis on a confirmed breakdown and sends an unconfirmed one to upload', () => {
		seed(parsed({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom('/marksheet/analysis')).toBeNull();

		marksheetStore().wipe();
		seed(parsed({ breakdownConfirmedAt: null }));
		expect(redirectFrom('/marksheet/analysis')).toMatchObject({
			status: 307,
			location: '/breakdown'
		});
	});

	it('sends nothing stored on any route to upload', () => {
		expect(redirectFrom('/breakdown')).toMatchObject({ status: 307, location: '/' });
		expect(redirectFrom('/marksheet')).toMatchObject({ status: 307, location: '/' });
	});

	it('sends an unreadable document back to upload', () => {
		localStorage.setItem(STORAGE_KEY, '{"schemaVersion":99}');

		expect(redirectFrom('/breakdown')).toMatchObject({ status: 307, location: '/' });
		expect(redirectFrom('/marksheet')).toMatchObject({ status: 307, location: '/' });
	});
});

// The gate runs first on every navigation; these render the surface it allowed,
// asserting synchronously (no await) that the stored state is what is on screen.
describe('first paint', () => {
	it('shows the stored breakdown with no loading state', () => {
		seed(parsed());
		expect(redirectFrom('/breakdown')).toBeNull();

		const screen = render(BreakdownPage);

		// Every cell is editable in place, so the entry's label is an input's value.
		expect(screen.container.querySelector<HTMLInputElement>('[data-field="label"]')?.value).toBe(
			'2bii'
		);
		expect(screen.container.querySelector<HTMLInputElement>('[data-field="marks"]')?.value).toBe(
			'4'
		);
		expect(screen.container.textContent).not.toMatch(/loading/i);
		expect(document.title).toBe('10X Ph1 · Breakdown · QLA');
	});

	it('shows the confirmed marksheet surface', () => {
		seed(parsed({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom('/marksheet')).toBeNull();

		const screen = render(MarksheetPage);

		expect(screen.container.textContent).toContain('0 students · 1 entry · 4 marks');
		// The columns the marksheet is built from, read-only.
		expect(screen.container.textContent).toContain('2bii');
		expect(screen.container.textContent).toContain('/4');
		expect(screen.container.textContent).not.toMatch(/loading/i);
		expect(document.title).toBe('Marksheet · QLA');
	});

	it('shows the parse form when nothing is stored', () => {
		expect(redirectFrom('/')).toBeNull();

		const screen = render(UploadPage);

		expect(screen.container.textContent).toContain('Parse assessment paper');
		expect(document.title).toBe('Upload · QLA');
	});
});
