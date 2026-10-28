import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

// Browser specs inherit SvelteKit's dev middleware. It serves project files (fonts) itself, and
// boots the SvelteKit server for any other request, whose dynamic import of hooks.server.ts fails
// under Vitest browser mode (`__vitest_browser_runner__` exists only in the page). Specs never
// render a route, so answer requests that are not files with a 404 before it gets them.
const notFoundForNonFiles: Plugin = {
	name: 'qla:client-spec-not-found',
	enforce: 'pre',
	configureServer: (server) => () => {
		server.middlewares.use((req, res, next) => {
			const path = decodeURI(new URL(req.originalUrl as string, 'http://localhost').pathname);
			const file = resolve(path.slice(1));
			if (existsSync(file) && statSync(file).isFile()) return next();
			res.statusCode = 404;
			res.end();
		});
	}
};

// The build SHA shown in the UI is baked in at build time from the git checkout. A build outside a
// checkout (git says "not a git repository", or is not installed) keeps the 'unknown' placeholder.
function buildInfo() {
	let sha = 'unknown';
	try {
		sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'pipe'] })
			.toString()
			.trim();
	} catch (error) {
		// execSync runs git through the shell, so a missing git is a shell "not found", not ENOENT.
		const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
		if (!/not a git repository|git: not found/.test(stderr)) throw error;
	}
	return { sha: sha || 'unknown', date: new Date().toISOString().slice(0, 10) };
}

const { sha: BUILD_SHA, date: BUILD_DATE } = buildInfo();

export default defineConfig({
	define: {
		__APP_BUILD_SHA__: JSON.stringify(BUILD_SHA),
		__APP_BUILD_DATE__: JSON.stringify(BUILD_DATE)
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [notFoundForNonFiles],
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['src/routes/spec-setup.ts'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
