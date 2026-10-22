import { closePdfBrowser } from '$lib/server/pdf';

// adapter-node emits this once the server has drained; stop the shared Chromium with it.
process.on('sveltekit:shutdown', closePdfBrowser);
