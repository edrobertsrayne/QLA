// Captures a page in light and dark mode for a PR body.
// Usage: node .agents/skills/pr/screenshot.mjs <url> <out-dir> <name>
// Writes <out-dir>/<name>-light.png and <out-dir>/<name>-dark.png.
// Set CHROMIUM_PATH to use a Chromium other than Playwright's own download.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [url, outDir, name] = process.argv.slice(2);
if (!url || !outDir || !name) {
	console.error('Usage: node .agents/skills/pr/screenshot.mjs <url> <out-dir> <name>');
	process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
	for (const colorScheme of ['light', 'dark']) {
		// mode-watcher follows the system preference until the user picks a theme,
		// so a fresh context's colorScheme decides which theme renders.
		const page = await browser.newPage({ colorScheme, viewport: { width: 1280, height: 800 } });
		const response = await page.goto(url, { waitUntil: 'networkidle' });
		if (!response?.ok()) throw new Error(`${url} returned ${response?.status()}`);
		const file = join(outDir, `${name}-${colorScheme}.png`);
		await page.screenshot({ path: file, fullPage: true });
		console.log(file);
		await page.close();
	}
} finally {
	await browser.close();
}
