// One side of A4 per student. The question table takes one full-width column
// when the page fits that way; otherwise two columns. When even two columns
// outgrow the page, the feedback steps down to no less than MIN_SCALE (90%),
// and past that the page is flagged with how many mm it runs over. Screen
// copies measure themselves with a ResizeObserver; print copies reuse the
// settled layout. Print clips the overflow; the flag never appears on paper.

/** CSS pixels per millimetre at 96 dpi. */
const PX_PER_MM = 96 / 25.4;

/** The feedback shrinks no further than 90%, then the page is flagged. */
const MIN_SCALE = 0.9;

/** The feedback's full-size type: the sheet's Tailwind class and shrink math share it. */
const FEEDBACK_PT = 10.5;

/** Shrink step toward the minimum. */
const SCALE_STEP = 0.025;

/** The feedback's type at a settled scale: full size at 1, down to 90%. */
export function feedbackFontSize(scale: number): string | undefined {
	return scale >= 1 ? undefined : `${FEEDBACK_PT * scale}pt`;
}

/** The question table's layout: one full-width column, or two. */
export type Columns = 1 | 2;

export interface PageFit {
	/** The question-table layout the page settled on. */
	columns: Columns;
	/** The feedback scale the page settled on. */
	scale: number;
	/** How far over the page the content runs, in whole mm. */
	overMm: number;
}

/** Past 90% the page is flagged: print would cut the overflow off. */
export function isFlagged(fit: PageFit): boolean {
	return fit.overMm > 0;
}

function overMmOf(overPx: number): number {
	return overPx <= 0 ? 0 : Math.max(1, Math.ceil(overPx / PX_PER_MM));
}

/**
 * Settle the layout for one measured page. Fit order: one column at full
 * feedback size; two columns at full size; two columns with the feedback
 * stepping down to the minimum, then the mm still over. The sheet applies the
 * layout and scale to the live page and reports back the resulting height, so
 * every step reflows for real. The last call to `contentHeightAt` is always
 * the settled layout.
 */
export function settleFit(
	boxHeight: number,
	contentHeightAt: (columns: Columns, scale: number) => number
): PageFit {
	if (contentHeightAt(1, 1) <= boxHeight) return { columns: 1, scale: 1, overMm: 0 };
	let scale = 1;
	let contentHeight = contentHeightAt(2, scale);
	while (contentHeight > boxHeight && scale > MIN_SCALE) {
		scale = Math.round((scale - SCALE_STEP) * 1000) / 1000;
		contentHeight = contentHeightAt(2, scale);
	}
	return { columns: 2, scale, overMm: overMmOf(contentHeight - boxHeight) };
}

class ReportFitState {
	/** Per student: the settled layout, feedback scale and mm over. */
	fits = $state<Record<string, PageFit>>({});

	fitOf(id: string): PageFit {
		return this.fits[id] ?? { columns: 2, scale: 1, overMm: 0 };
	}

	setFit(id: string, fit: PageFit): void {
		this.fits[id] = fit;
	}
}

let instance: ReportFitState | null = null;

/** Shared fit state: screen sheets record here; strips and print read here. */
export function reportFit(): ReportFitState {
	return (instance ??= new ReportFitState());
}
