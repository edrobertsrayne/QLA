// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Baked in at build time by vite.config.ts.
	const __APP_BUILD_SHA__: string;
	const __APP_BUILD_DATE__: string;
}

export {};
