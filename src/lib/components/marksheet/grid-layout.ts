// The widths and classes the marksheet grid's parts share: the sticky cells and
// the band label pin themselves at offsets the column widths decide, so they
// live in one place.

/** The frozen columns and the entry columns. */
export const COLUMN = { name: '10rem', progress: '4rem', entry: '2.5rem' };
export const NAME_COLUMN = 'sticky left-0 z-20 border-r bg-background';
export const FROZEN_PROGRESS = 'sticky z-20 border-r bg-background';
/** Where the progress column pins itself: past the name column. */
export const PROGRESS_PIN = `left: ${COLUMN.name}`;
/** The room the frozen columns take, measured from the table's left edge. */
export const FROZEN_WIDTH = `calc(${COLUMN.name} + ${COLUMN.progress})`;
/** Where a band label pins itself: past both frozen columns. */
export const BAND_LABEL_PIN = `left: ${FROZEN_WIDTH}`;
/**
 * What a mark cell keeps clear of when it is scrolled into view: the frozen
 * columns pin over the cells beside them, so without this a cell can sit
 * inside the viewport and still be underneath the name and progress columns.
 * `scrollIntoView` honours it, which is the whole of the rule.
 */
export const CELL_REVEAL = `scroll-margin-inline-start: ${FROZEN_WIDTH}`;
export const selectedCell = 'ring-2 ring-primary ring-inset';
/** A cell reads as the document until it is being edited. */
export const CELL_EDITOR =
	'min-w-0 flex-1 rounded-sm bg-muted/40 px-1 py-0.5 outline-none focus:bg-background focus:ring-1 focus:ring-ring';
/** Row controls stay out of the way until the row is hovered or focused — and are simply there where there is no hover to give, as on a touch screen. */
export const rowControl =
	'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100';
