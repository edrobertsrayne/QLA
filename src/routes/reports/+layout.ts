import { redirect } from '@sveltejs/kit';
import { marksheetStore } from '$lib/marksheet/index.js';
import { landingStep, reportStepFrom, stepAllowed } from '$lib/marksheet/report-steps.js';

/**
 * Every report URL is a step the paper allows. A bare `/reports`, a step the
 * paper does not have and a step a topic-name gap locks all redirect (replacing
 * the history entry) to the landing step.
 */
export async function load({ url, parent }: { url: URL; parent: () => Promise<unknown> }) {
	await parent();
	const document = marksheetStore().document;
	if (!document) redirect(307, '/');
	const step = reportStepFrom(url.pathname.split('/')[2]);
	if (step === null || !stepAllowed(document, step)) {
		redirect(307, `/reports/${landingStep(document)}`);
	}
	return { step };
}
