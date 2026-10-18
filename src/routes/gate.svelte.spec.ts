import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { STORAGE_KEY } from '$lib/marksheet/document.js';
import { NOW, parsed, seed } from '$lib/marksheet/fixtures.spec-helpers.js';
import { load as breakdownLoad } from './breakdown/+page.js';
import BreakdownPage from './breakdown/+page.svelte';
import { load as marksheetLoad } from './marksheet/+page.js';
import MarksheetPage from './marksheet/+page.svelte';
import { load as uploadLoad } from './+page.js';
import UploadPage from './+page.svelte';

// Named for what it is: `document` is the DOM.
const marksheetDocument = parsed;

function redirectFrom(load: () => unknown): { status: number; location: string } | null {
	try {
		load();
		return null;
	} catch (error) {
		return error as { status: number; location: string };
	}
}

beforeEach(() => {
	localStorage.clear();
});

describe('boot gate', () => {
	it('lets every surface through when the stored state allows it', () => {
		expect(redirectFrom(uploadLoad)).toBeNull();

		seed(marksheetDocument({ breakdownConfirmedAt: null }));
		expect(redirectFrom(breakdownLoad)).toBeNull();

		seed(marksheetDocument({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom(marksheetLoad)).toBeNull();
	});

	it('sends a stored document from upload to the surface it allows', () => {
		seed(marksheetDocument({ breakdownConfirmedAt: null }));
		expect(redirectFrom(uploadLoad)).toMatchObject({ status: 307, location: '/breakdown' });

		seed(marksheetDocument({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom(uploadLoad)).toMatchObject({ status: 307, location: '/marksheet' });
	});

	it('sends an unconfirmed breakdown to upload and to the marksheet away', () => {
		seed(marksheetDocument({ breakdownConfirmedAt: null }));
		expect(redirectFrom(marksheetLoad)).toMatchObject({ status: 307, location: '/breakdown' });
	});

	it('sends a confirmed breakdown on the breakdown route to the marksheet', () => {
		seed(marksheetDocument({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom(breakdownLoad)).toMatchObject({ status: 307, location: '/marksheet' });
	});

	it('sends nothing stored on any route to upload', () => {
		expect(redirectFrom(breakdownLoad)).toMatchObject({ status: 307, location: '/' });
		expect(redirectFrom(marksheetLoad)).toMatchObject({ status: 307, location: '/' });
	});

	it('sends an unreadable document back to upload', () => {
		localStorage.setItem(STORAGE_KEY, '{"schemaVersion":99}');

		expect(redirectFrom(breakdownLoad)).toMatchObject({ status: 307, location: '/' });
		expect(redirectFrom(marksheetLoad)).toMatchObject({ status: 307, location: '/' });
	});
});

// The gate runs first on every navigation; these render the surface it allowed,
// asserting synchronously (no await) that the stored state is what is on screen.
describe('first paint', () => {
	it('shows the stored breakdown with no loading state', () => {
		seed(marksheetDocument());
		expect(redirectFrom(breakdownLoad)).toBeNull();

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
		seed(marksheetDocument({ breakdownConfirmedAt: NOW }));
		expect(redirectFrom(marksheetLoad)).toBeNull();

		const screen = render(MarksheetPage);

		expect(screen.container.textContent).toContain('0 students · 1 entry · 4 marks');
		// The columns the marksheet is built from, read-only.
		expect(screen.container.textContent).toContain('2bii');
		expect(screen.container.textContent).toContain('/4');
		expect(screen.container.textContent).not.toMatch(/loading/i);
		expect(document.title).toBe('Marksheet · QLA');
	});

	it('shows the parse form when nothing is stored', () => {
		expect(redirectFrom(uploadLoad)).toBeNull();

		const screen = render(UploadPage);

		expect(screen.container.textContent).toContain('Parse assessment paper');
		expect(document.title).toBe('Upload · QLA');
	});
});
