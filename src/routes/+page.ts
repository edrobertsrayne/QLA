import { gateSurface } from '$lib/marksheet/boot.js';

/** Upload exists only while nothing is stored. */
export function load(): void {
	gateSurface('/');
}
