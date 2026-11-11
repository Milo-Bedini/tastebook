import '@testing-library/jest-dom/vitest';

import { cleanup, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

import { toast } from '@/dino';

import { matchMedia, setLaptop } from './media';
import { server } from './server';

// jsdom lays nothing out, so it has neither; Radix measures with one and the combobox scrolls its active option.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
// jsdom has one, but it only logs that it isn't implemented; the recipes page's pager scrolls to the top.
window.scrollTo = () => {};
window.matchMedia ??= matchMedia;

// For the check in vitest.documented-answers.ts that every documented error answer has a page test.
const answered: string[] = [];
server.events.on('response:mocked', ({ request, response }) => {
  answered.push(`${request.method} ${new URL(request.url).pathname} ${response.status}`);
});

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(async ({ task }) => {
  task.meta.answered = answered.splice(0);
  // Sonner removes a dismissed toast on a timer; one still pending when a file's environment closes calls into a
  // React with no window, and one left showing would turn up in the next test.
  toast.dismiss();
  await waitFor(() => expect(document.querySelector('[data-sonner-toast]')).toBeNull());
  cleanup();
  server.resetHandlers();
  setLaptop(false);
});
afterAll(() => server.close());
