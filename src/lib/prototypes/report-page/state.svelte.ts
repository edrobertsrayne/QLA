// PROTOTYPE — in-memory state for the report page prototype (wayfinder #53).
// Nothing persists: a reload restores the canned prose.

import { generatedProse, initialProse, type Prose } from './sample.js';

/**
 * What happens when the feedback no longer fits one side of A4:
 * - shrink (chosen): the feedback text steps down to 90%, then the page is flagged.
 * - cap: the editor refuses words past a cap per strength / area.
 * - flag: nothing gives; the page is marked over on screen and print clips it.
 */
export type FitMode = 'shrink' | 'cap' | 'flag';

export const CAPS = { strengths: 30, areas: 60 } as const;

class ReportPageState {
	prose = $state<Record<string, Prose>>(initialProse());
	fit = $state<FitMode>('shrink');
	greyscale = $state(false);
	/** Per student: the feedback scale shrink settled on, and how far over the page it runs (mm). */
	scale = $state<Record<string, number>>({});
	overMm = $state<Record<string, number>>({});

	/** Stress test: what a teacher who keeps typing does to the page. */
	pad(): void {
		for (const prose of Object.values(this.prose))
			prose.areas = prose.areas.map(
				(a) =>
					`${a} We went through an example of this in class, so look back at your notes from that lesson and try the similar question at the end of the chapter before the next test.`
			);
	}
	revert(id: string): void {
		this.prose[id] = generatedProse(id);
	}
}

let instance: ReportPageState | null = null;
export function reportPage(): ReportPageState {
	return (instance ??= new ReportPageState());
}

export function wordCount(text: string): number {
	return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

export function capWords(text: string, cap: number): string {
	const words = text.split(/(\s+)/);
	let seen = 0;
	let out = '';
	for (const part of words) {
		if (part.trim() !== '') {
			if (seen === cap) break;
			seen++;
		}
		out += part;
	}
	return out;
}
