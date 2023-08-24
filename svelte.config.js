import adapter from '@sveltejs/adapter-node';
import * as child_process from 'node:child_process';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter(),
		version: {
			name:
				process.env.VERSION ||
				child_process.execSync('git rev-parse --short HEAD').toString().trim()
		},
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['none'],
				'script-src': ['self', 'static.cloudflareinsights.com'],
				'style-src': ['self', 'unsafe-inline'],
				'connect-src': ['self', 'cloudflareinsights.com'],
				// 'img-src': ['self', 'source.boringavatars.com'],
				'img-src': ['*'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'manifest-src': ['self'],
				'font-src': ['self', 'data:']
			}
		}
	}
};

export default config;
