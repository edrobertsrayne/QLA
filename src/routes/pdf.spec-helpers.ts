// Test-only: a fetch for specs of the PDF downloads. Fonts are read for real
// (the page inlines them into what it sends), `/api/pdf` answers as given, and
// the model list the reports page asks for on arrival is empty.

import { vi } from 'vitest';

const stubPdf = () => new Response(new Blob(['%PDF-1.4 stub'], { type: 'application/pdf' }));

export function stubPdfFetch(pdf: () => Response | Promise<Response> = stubPdf) {
	const real = globalThis.fetch;
	const stub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		if (String(url) === '/api/pdf') return pdf();
		if (String(url) === '/api/models') return Response.json({ models: [] });
		return real(url, init);
	});
	vi.stubGlobal('fetch', stub);
	return stub;
}

/** The HTML bodies the page POSTed to `/api/pdf`, in order. */
export function sentHtml(stub: { mock: { calls: unknown[][] } }): string[] {
	return stub.mock.calls
		.filter(([url]) => String(url) === '/api/pdf')
		.map(([, init]) => String((init as RequestInit).body));
}
