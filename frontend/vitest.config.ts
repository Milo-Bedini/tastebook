import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts'],
            globalSetup: ['./vitest.documented-answers.ts', './vitest.slow-tests.ts'],
            include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.tsx']
          }
        },
        {
          extends: true,
          plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)) })],
          // Vite finds these only once a story imports them, then re-bundles and reloads the page mid-run, which can
          // leave a story's iframe never ready.
          optimizeDeps: {
            include: ['@sentry/react', '@tanstack/react-query', 'openapi-fetch', 'react-router/dom']
          },
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }]
            }
          }
        }
      ]
    }
  })
);
