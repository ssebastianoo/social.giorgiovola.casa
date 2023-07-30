import adapter from '@sveltejs/adapter-node';
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
        csp: {
            mode: 'auto',
            directives: {
                'default-src': ['none'],
                'script-src': ['self'],
                'style-src': ['self'],
                'connect-src': ['self'],
                'img-src': ['self', 'source.boringavatars.com'],
                'base-uri': ['self'],
                'form-action': ['self'],
                'manifest-src': ['self'],
                'font-src': ['self'],
            }
        }
    }
};

export default config;
