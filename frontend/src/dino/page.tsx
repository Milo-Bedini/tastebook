import type { ReactNode } from 'react';

type PageProps = { children: ReactNode };

// The insets are 0 outside a notched phone, so the usual padding still applies; viewport-fit=cover in index.html
// is what makes the browser report them. The top inset is the top bar's, which sits above.
// While the Dock is in the document, a phone's foot keeps its 104 px clear (62 px, 20 px under it and 22 px of air)
// plus the inset it floats above, so the page's end scrolls out from under it. The Dock is a sibling mounted
// elsewhere, hence :has() rather than a prop.
export const Page = ({ children }: PageProps) => (
  <main className="mx-auto flex w-full max-w-300 flex-col gap-6 pt-6 pr-[max(--spacing(5),env(safe-area-inset-right))] pb-[max(--spacing(12),env(safe-area-inset-bottom))] pl-[max(--spacing(5),env(safe-area-inset-left))] in-[body:has([data-slot=dock])]:max-sm:pb-[calc(--spacing(26)+env(safe-area-inset-bottom))] sm:pt-8 sm:pr-[max(--spacing(8),env(safe-area-inset-right))] sm:pl-[max(--spacing(8),env(safe-area-inset-left))]">
    {children}
  </main>
);
