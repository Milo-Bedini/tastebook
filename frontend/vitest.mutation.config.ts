import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

// The unit project from vitest.config.ts alone, for Stryker. It runs several test runners at once, and the story
// tests' browser sessions then collide on a port, so mutants are judged by the jsdom tests.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}']
    }
  })
);
