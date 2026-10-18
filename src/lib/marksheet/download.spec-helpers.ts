// Reading a download a surface handed to the browser, for the specs that
// assert what a teacher would actually get. Test-only: nothing in the app
// imports this.

import { vi } from 'vitest';

/**
 * The file the next click hands the browser: its name, and what it holds. Both
 * come from the app's own download, so a test reads the real thing rather than
 * a fixture beside it.
 */
export function captureDownload(): { filename: () => string; text: () => Promise<string> } {
	const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
	const blobs = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:captured');
	// Spying twice on the same method hands back the same mock, so a spec that
	// captures two downloads in a row would otherwise read the first one twice.
	clicks.mockClear();
	blobs.mockClear();
	return {
		filename: () => (clicks.mock.instances[0] as HTMLAnchorElement | undefined)?.download ?? '',
		text: async () => {
			const blob = blobs.mock.calls[0]?.[0] as Blob | undefined;
			if (!blob) throw new Error('nothing was handed to the browser');
			return blob.text();
		}
	};
}
