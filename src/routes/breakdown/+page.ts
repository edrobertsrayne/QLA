import { gateSurface } from '$lib/marksheet/boot.js';

/** The breakdown is the surface for a stored, unconfirmed breakdown. */
export function load(): void {
	gateSurface('/breakdown');
}
