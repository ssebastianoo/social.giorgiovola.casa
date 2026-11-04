import adapter from '@sveltejs/adapter-node';
import * as child_process from 'node:child_process';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

// there is no .git directory inside the docker build
function gitVersion() {
	try {
		return child_process
			.execSync('git rev-parse --short HEAD', { stdio: 'pipe' })
			.toString()
			.trim();
	} catch {
		return 'dev';
	}
}

// The public origin used for the CSRF check on form submissions. SvelteKit 3 removed
// adapter-node's runtime ORIGIN variable, so this is fixed at build time from PUBLIC_URL
// (a Docker build arg, or .env for local builds). Changing PUBLIC_URL requires a rebuild.
function publicOrigin(mode: string) {
	const url = process.env.PUBLIC_URL || loadEnv(mode, process.cwd(), '').PUBLIC_URL;
	return url ? new URL(url).origin : undefined;
}

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			version: { name: process.env.VERSION || gitVersion() },
			paths: { origin: publicOrigin(mode) },
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['none'],
					'script-src': ['self', 'static.cloudflareinsights.com'],
					'style-src': ['self', 'unsafe-inline'],
					'connect-src': ['self', 'cloudflareinsights.com'],
					// posts embed external images; `*` is valid CSP but missing from SvelteKit's Source type
					// @ts-expect-error
					'img-src': ['*'],
					'base-uri': ['self'],
					'frame-ancestors': ['none'],
					'object-src': ['none'],
					'form-action': ['self'],
					'manifest-src': ['self'],
					'font-src': ['self', 'data:']
				}
			}
		})
	]
}));
