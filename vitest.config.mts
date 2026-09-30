import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
	resolve: {
		// Use n8n-workflow's CommonJS build, which is what n8n loads at runtime
		alias: { 'n8n-workflow': require.resolve('n8n-workflow') },
	},
	test: {
		include: ['test/**/*.test.ts'],
		server: { deps: { external: [/node_modules\/n8n-workflow/] } },
		coverage: {
			provider: 'v8',
			include: ['nodes/**/*.ts', 'credentials/**/*.ts'],
			reporter: ['text', 'html'],
			// Slightly below the current values, so coverage can't silently drop
			thresholds: { lines: 95, statements: 95, functions: 100, branches: 85 },
		},
	},
});
