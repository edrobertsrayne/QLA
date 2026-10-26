import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import AppNav from '$lib/components/shell/AppNav.svelte';
import { STORAGE_KEY, type MarksheetDocument } from '$lib/marksheet/document.js';
import {
	confirmed,
	entry,
	readSeeded,
	seed,
	student,
	tier
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';

/** A confirmed assessment with a class on it, and the work a new class takes. */
function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		className: '10C1',
		tiers: [
			tier({
				tierName: 'Higher',
				breakdown: {
					entries: [entry('entry-1', '1a', '1', { specPoint: '3.2.1.4' })],
					warnings: []
				},
				boundaries: [{ label: 'A', minimum: 3 }]
			})
		],
		students: [
			student('student-1', 'Ada', 'Lovelace', false, 0),
			student('student-2', 'Grace', 'Hopper', false, 0)
		],
		marks: { 'student-1': { 'entry-1': 3 }, 'student-2': { 'entry-1': 2 } },
		topicNames: { '3.2.1.4': 'Rates of reaction' },
		aoDescriptions: { AO2: 'Apply knowledge' },
		...overrides
	});
}

function openNav() {
	marksheetStore().load();
	return render(AppNav);
}

async function openNewClass() {
	await page.getByRole('button', { name: 'New class…' }).click();
	return page.getByRole('dialog');
}

describe('the new-class dialog', () => {
	it('is offered only once there is a class to discard', async () => {
		seed(marksheet({ students: [], marks: {}, className: null }));
		openNav();

		expect(page.getByRole('button', { name: 'New class…' }).query()).toBeNull();
	});

	it('names the class it takes, and keeps the assessment', async () => {
		seed(marksheet());
		openNav();

		const dialog = await openNewClass();

		await expect.element(dialog).toHaveTextContent('Start a new class?');
		await expect
			.element(dialog)
			.toHaveTextContent(/This deletes the class of 2 students and 2 marks/);
		await expect
			.element(page.getByRole('button', { name: 'Delete 2 marks and start the class again' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete 2 marks and start the class again' }).click();
		marksheetStore().flush();

		const stored = readSeeded();
		expect(stored.students).toEqual([]);
		expect(stored.marks).toEqual({});
		expect(stored.className).toBeNull();
		// The paper is still there to mark for the next class.
		expect(stored.tiers).toEqual(marksheet().tiers);
		expect(stored.topicNames).toEqual({ '3.2.1.4': 'Rates of reaction' });
		expect(stored.aoDescriptions).toEqual({ AO2: 'Apply knowledge' });
		expect(stored.commonQuestions).toEqual([]);
		expect(marksheetStore().className).toBeNull();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/marksheet'));
	});

	it('leaves the document alone when the teacher keeps working', async () => {
		const before = marksheet();
		seed(before);
		openNav();

		const dialog = await openNewClass();
		await page.getByRole('button', { name: 'Keep working' }).click();

		await expect.element(dialog).not.toBeInTheDocument();
		expect(readSeeded()).toEqual(before);
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
	});
});
