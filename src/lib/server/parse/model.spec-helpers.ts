import type { Breakdown, ParseUsage } from './schema';
import { setModelTransport, type ModelResult } from './model';

/** Zero usage, as reported by the stub transport. */
export function stubUsage(): ParseUsage {
	return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 };
}

/** Deterministic fixture breakdown. Schema-valid with zero warnings. */
export function stubBreakdown(): Breakdown {
	return {
		questions: [
			{
				id: '1a',
				questionNumber: '1',
				marks: 1,
				summary: 'Transverse wave oscillation direction',
				specPoint: '4.6.1.1',
				commandWord: 'Complete',
				ao: 'AO1'
			},
			{
				id: '1b',
				questionNumber: '1',
				marks: 6,
				summary: 'Method for infrared investigation task',
				specPoint: null,
				commandWord: 'Describe',
				ao: 'AO3'
			},
			{
				id: '2a',
				questionNumber: '2',
				marks: 2,
				summary: 'Tick box plus give reason',
				specPoint: null,
				commandWord: null,
				ao: 'AO2'
			}
		]
	};
}

async function stubTransport(): Promise<ModelResult> {
	return { rawJson: JSON.stringify(stubBreakdown()), usage: stubUsage() };
}

/** Install the deterministic stub transport. */
export function setStubTransport(): void {
	setModelTransport(stubTransport);
}
