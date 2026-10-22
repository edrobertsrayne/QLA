// `POST /api/pdf` — print-ready HTML in, `application/pdf` out.
//
// The body is the self-contained HTML of what Print would print (its CSS
// inlined, no links). It is size-capped while it is read, rendered with
// JavaScript and the network off (`renderPdf`), and answered as the PDF.
// Request bodies and PDFs are never logged, matching `/api/report`.

import type { RequestHandler } from './$types';
import { MAX_PDF_HTML_BYTES, PdfBusyError, PdfTimeoutError, renderPdf } from '$lib/server/pdf';
import { failure } from '$lib/server/structured-route';

const INVALID_INPUT_CODE = 'INVALID_PDF_INPUT';

function tooLarge(): Response {
	return failure(413, {
		code: INVALID_INPUT_CODE,
		message: 'The PDF request is too large.',
		retryable: false
	});
}

/** The body as text, or null once it passes the cap: never read past the cap, whatever the headers say. */
async function readCappedText(request: Request): Promise<string | null> {
	const declared = Number(request.headers.get('content-length'));
	if (declared > MAX_PDF_HTML_BYTES) return null;
	if (!request.body) return '';
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let text = '';
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > MAX_PDF_HTML_BYTES) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}

export const POST: RequestHandler = async ({ request }) => {
	const html = await readCappedText(request);
	if (html === null) return tooLarge();
	if (html.trim() === '') {
		return failure(400, {
			code: INVALID_INPUT_CODE,
			message: 'The PDF request is empty.',
			retryable: false
		});
	}
	try {
		const pdf = await renderPdf(html);
		return new Response(new Uint8Array(pdf), {
			headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		if (error instanceof PdfBusyError) {
			return failure(503, { code: 'PDF_BUSY', message: error.message, retryable: true });
		}
		if (!(error instanceof PdfTimeoutError)) throw error;
		return failure(504, { code: 'PDF_RENDER_TIMEOUT', message: error.message, retryable: true });
	}
};
