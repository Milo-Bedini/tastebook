// What a page that opens another asks of its focus: a new list's page, or Lists after a list is deleted, moves focus to
// its heading.
export type FocusRequest = { focus: 'heading' };

export const asksForHeading = (state: unknown) =>
  typeof state === 'object' && state !== null && 'focus' in state && state.focus === 'heading';

// Focus moves at the commit that shows its target, so it lands whatever else the page is doing.
export const takeFocus = (element: HTMLElement | null) => element?.focus();
