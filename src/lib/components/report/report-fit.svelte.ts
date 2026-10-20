// One side of A4 per student: when the feedback outgrows the page, the
// feedback steps down to no less than MIN_SCALE (90%), and past that the page
// is flagged with how many mm it runs over. Screen copies measure themselves
// with a ResizeObserver; print copies reuse the settled scale. Print clips the
// overflow; the flag never appears on paper.

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
export interface PageFit {
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
 * Settle the feedback scale for one measured page: step down from full size
 * until the content fits or the minimum is reached, then record how far over
 * the page the content still runs. The sheet sets the scale on the live page
 * and reports back the resulting heights, so shrinking reflows for real.
 */
export function settleFit(boxHeight: number, contentHeightAt: (scale: number) => number): PageFit {
	let scale = 1;
	let contentHeight = contentHeightAt(scale);
	while (contentHeight > boxHeight && scale > MIN_SCALE) {
		scale = Math.round((scale - SCALE_STEP) * 1000) / 1000;
		contentHeight = contentHeightAt(scale);
	}
	return { scale, overMm: overMmOf(contentHeight - boxHeight) };
}

class ReportFitState {
	/** Per student: the settled feedback scale and mm over. */
	fits = $state<Record<string, PageFit>>({});

	fitOf(id: string): PageFit {
		return this.fits[id] ?? { scale: 1, overMm: 0 };
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
