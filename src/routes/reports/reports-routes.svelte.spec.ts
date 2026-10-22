import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import { seed } from '$lib/marksheet/fixtures.spec-helpers.js';
import {
	h556,
	ok,
	openReports,
	plain,
	solo,
	stubFetch,
	topicNames,
	writeFor
} from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** The paper with every topic named, so no gap blocks. */
function named() {
	const doc = h556();
	doc.topicNames = {
		'5.1.1': 'Kinetic theory of gases',
		'5.1.2': 'Gas pressure and temperature',
		'5.2.1': 'Internal energy stores'
	};
	return doc;
}

describe('report step routes', () => {
	describe('bare /reports', () => {
		it('lands on Topic names while a topic-name gap blocks', async () => {
			seed(h556());
			stubFetch();
			const { router } = await openReports('/reports');
			expect(router.path).toBe('/reports/topics');
		});

		it('lands on Review when reports exist and nothing blocks', async () => {
			const doc = plain();
			writeFor(doc, ['ada']);
			seed(doc);
			stubFetch();
			const { router } = await openReports('/reports');
			expect(router.path).toBe('/reports/review');
		});

		it('lands on Topic names for a named paper with topic codes and no reports', async () => {
			seed(named());
			stubFetch();
			const { router } = await openReports('/reports');
			expect(router.path).toBe('/reports/topics');
		});

		it('lands on Grades for a paper with no topic codes and no reports', async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports');
			expect(router.path).toBe('/reports/grades');
		});

		it('replaces the entry rather than adding one', async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports');
			expect(router.entries).toEqual(['/reports/grades']);
		});
	});

	describe('a step the teacher cannot open', () => {
		it('redirects a locked step to the landing step while a gap blocks', async () => {
			const doc = h556();
			writeFor(doc, ['ada']);
			seed(doc);
			stubFetch();
			const { router } = await openReports('/reports/review');
			expect(router.path).toBe('/reports/topics');
			expect(router.entries).toEqual(['/reports/topics']);
			await expect.element(page.getByRole('button', { name: '2. Grades' })).toBeDisabled();
		});

		it('redirects Topic names on a paper with no topic codes', async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports/topics');
			expect(router.path).toBe('/reports/grades');
		});

		it('redirects an unknown step', async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports/nonsense');
			expect(router.path).toBe('/reports/grades');
		});
	});

	describe('reloading a step URL', () => {
		it('stays on an allowed step', async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports/who');
			expect(router.path).toBe('/reports/who');
			await expect
				.element(page.getByRole('heading', { name: '7 students get a report' }))
				.toBeInTheDocument();
		});

		it('stays on Writing with nothing being written', async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports/writing');
			expect(router.path).toBe('/reports/writing');
			await expect
				.element(page.getByRole('heading', { name: 'Nothing is being written' }))
				.toBeInTheDocument();
		});

		it('names the step in the page title', async () => {
			const doc = plain();
			doc.paper.className = '10C1';
			writeFor(doc, ['ada']);
			seed(doc);
			stubFetch();
			await openReports('/reports/review');
			await vi.waitFor(() => expect(document.title).toBe('10C1 · Reports — Review · QLA'));
		});
	});

	describe('history', () => {
		it("pushes the teacher's own step changes, so Back walks the steps", async () => {
			seed(plain());
			stubFetch();
			const { router } = await openReports('/reports/grades');

			await page.getByRole('button', { name: /^Skip/ }).click();
			await expect
				.element(page.getByRole('heading', { name: '7 students get a report' }))
				.toBeInTheDocument();
			expect(router.entries).toEqual(['/reports/grades', '/reports/who']);

			await router.back();
			expect(router.path).toBe('/reports/grades');
			await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();
		});

		it('keeps a run going across step moves, and replaces the entry when it finishes', async () => {
			seed(solo());
			let release: () => void = () => {};
			const held = new Promise<void>((resolve) => (release = resolve));
			const { stub } = stubFetch(async () => {
				await held;
				return ok();
			});
			const { router } = await openReports('/reports/who');

			await page.getByRole('button', { name: 'Write 1 report' }).click();
			await expect
				.element(page.getByRole('heading', { name: 'Writing 0 of 1…' }))
				.toBeInTheDocument();
			expect(router.path).toBe('/reports/writing');

			await page.getByRole('button', { name: '1. Grades' }).click();
			await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();
			await page.getByRole('button', { name: '3. Writing' }).click();
			await expect
				.element(page.getByRole('heading', { name: 'Writing 0 of 1…' }))
				.toBeInTheDocument();
			const before = router.entries.length;

			release();
			await vi.waitFor(() => expect(router.path).toBe('/reports/review'));
			expect(router.entries.length).toBe(before);
			expect(router.entries).not.toContain('/reports/review/');
			expect(stub.mock.calls.filter(([url]) => String(url) === '/api/report').length).toBe(1);
		});

		it('walks Back from Review to the step before it', async () => {
			const doc = plain();
			writeFor(doc, ['ada']);
			seed(doc);
			stubFetch();
			const { router } = await openReports('/reports/who');

			await page.getByRole('button', { name: '4. Review and print' }).click();
			expect(router.path).toBe('/reports/review');

			await router.back();
			expect(router.path).toBe('/reports/who');
		});
	});

	it('names a Topic names proposal from the topics route', async () => {
		seed(h556());
		stubFetch((n) => (n === 0 ? topicNames() : ok()));
		const { router } = await openReports('/reports');
		expect(router.path).toBe('/reports/topics');
		await expect
			.element(page.getByRole('button', { name: '1. Topic names' }))
			.toHaveAttribute('aria-current', 'step');
	});
});
