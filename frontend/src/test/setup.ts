import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { matchMedia, setLaptop } from './media';
import { server } from './server';

// jsdom lays nothing out, so it has neither; Radix measures with one and the combobox scrolls its active option.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
window.matchMedia ??= matchMedia;

// For the check in vitest.documented-answers.ts that every documented error answer has a page test.
const answered: string[] = [];
server.events.on('response:mocked', ({ request, response }) => {
  answered.push(`${request.method} ${new URL(request.url).pathname} ${response.status}`);
});

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(({ task }) => {
  task.meta.answered = answered.splice(0);
  cleanup();
  server.resetHandlers();
  setLaptop(false);
});
afterAll(() => server.close());
