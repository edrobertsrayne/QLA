import { gateSurface } from '$lib/marksheet/boot.js';

/** The marksheet is the surface for a confirmed breakdown. */
export function load(): void {
	gateSurface('/marksheet');
}
