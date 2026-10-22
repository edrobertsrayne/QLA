import { describe, expect, it } from 'vitest';
import { settleFit, type Columns } from './report-fit.svelte.js';

const BOX = 1000;
const PX_PER_MM = 96 / 25.4;

/** A page whose content height depends on layout and feedback scale. */
function page(height: (columns: Columns, scale: number) => number) {
	const calls: [Columns, number][] = [];
	const fit = settleFit(BOX, (columns, scale) => {
		calls.push([columns, scale]);
		return height(columns, scale);
	});
	return { fit, calls };
}

describe('settleFit', () => {
	it('uses one column at full size when it fits', () => {
		const { fit, calls } = page(() => BOX);
		expect(fit).toEqual({ columns: 1, scale: 1, overMm: 0 });
		expect(calls).toEqual([[1, 1]]);
	});

	it('falls back to two columns at full size when one column overflows', () => {
		const { fit, calls } = page((columns) => (columns === 1 ? BOX + 50 : BOX - 10));
		expect(fit).toEqual({ columns: 2, scale: 1, overMm: 0 });
		expect(calls).toEqual([
			[1, 1],
			[2, 1]
		]);
	});

	it('shrinks the feedback in two columns when full size overflows', () => {
		const { fit, calls } = page((columns, scale) =>
			columns === 1 ? BOX + 200 : BOX + Math.round((scale - 0.95) * 4000)
		);
		expect(fit.columns).toBe(2);
		expect(fit.scale).toBe(0.95);
		expect(fit.overMm).toBe(0);
		expect(calls.every(([columns], i) => columns === (i === 0 ? 1 : 2))).toBe(true);
	});

	it('flags the mm over when 90% in two columns still overflows', () => {
		const { fit } = page(() => BOX + 9.5 * PX_PER_MM);
		expect(fit).toEqual({ columns: 2, scale: 0.9, overMm: 10 });
	});
});
