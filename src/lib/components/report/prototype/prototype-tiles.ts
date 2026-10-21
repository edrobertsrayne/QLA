// PROTOTYPE (#92), throwaway: lives only on the prototype/report-tile-status branch.
// Shared shape the tile-status variants render; the state is the real TileState.
import type { TileState } from '../report-run.svelte.js';

export interface ProtoTile {
	id: string;
	name: string;
	state: TileState;
}

export interface VariantProps {
	tiles: ProtoTile[];
	running: boolean;
	onretry: (id: string) => void;
}

/** Real failure messages the server and the run produce. */
export const FAILURES = [
	'The model provider is busy. Please try again.',
	'The model response was cut off. Please try again.',
	'The model returned an unreadable response. Please try again.',
	'Must hold at most 3 strengths.',
	'This student can no longer have a report.'
];

export const LABEL = { queued: 'Queued', writing: 'Writing', ready: 'Ready', failed: 'Failed' };
