import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);
// Set by the preview checks workflow: the specs run against a Vercel preview instead of a local stack.
// The fixtures in e2e/fixtures.ts get past its Vercel sign-in.
const previewUrl = process.env.PREVIEW_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  // The JSON results feed the preview checks' comment on the PR.
  reporter: isCi
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : 'list',
  use: {
    baseURL: previewUrl ?? 'http://localhost:5173',
    // A trace records request headers, so on a preview it would carry the bypass secret into the uploaded report.
    trace: previewUrl ? 'off' : 'retain-on-failure',
    // picnic.css then collapses transitions, so axe never reads a colour mid-transition.
    reducedMotion: 'reduce',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: previewUrl
    ? undefined
    : [
        {
          command: 'uv run python manage.py runserver 8000',
          cwd: '../backend',
          // A made-up store, so a recipe takes the photo e2e/recipe-photo.spec.ts answers its upload with; nothing
          // reaches the real one.
          env: { DJANGO_DEBUG: 'true', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_e2estore_notarealtoken' },
          url: 'http://localhost:8000/api/health/',
          reuseExistingServer: !isCi
        },
        {
          command: 'pnpm dev',
          url: 'http://localhost:5173',
          reuseExistingServer: !isCi
        }
      ]
});
