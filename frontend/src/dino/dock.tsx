import { NavLink } from 'react-router';

import { cn } from '@/dino/cn';
import type { NavTab } from '@/dino/top-bar-tabs';

type DockProps = {
  tabs: NavTab[];
};

const tab =
  'flex h-11.5 items-center justify-center gap-2 whitespace-nowrap rounded-pill border-2 border-transparent text-label no-underline transition focus-visible:outline-offset-0 focus-visible:outline-on-dock active:scale-97';
// The current tab sets its own forced colours, as the text backplate would otherwise hide HighlightText.
const currentTab =
  'w-full bg-peach px-4 text-on-pastel hover:bg-peach-hover active:bg-peach-pressed forced-colors:border-[CanvasText] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none forced-colors:hover:bg-[Highlight] forced-colors:active:bg-[Highlight] forced-colors:focus-visible:outline-[CanvasText]';
const otherTab = 'w-16 text-on-dock hover:bg-on-dock/10 active:bg-on-dock/20';

// Phones only: from 640 px the same tabs are in the top bar (TopBarTabs).
export const Dock = ({ tabs }: DockProps) => {
  if (tabs.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="Main"
      // Page keeps its foot clear of the dock while this is in the document.
      data-slot="dock"
      className="fixed right-[max(--spacing(5),env(safe-area-inset-right))] bottom-[calc(--spacing(5)+env(safe-area-inset-bottom))] left-[max(--spacing(5),env(safe-area-inset-left))] flex h-15.5 items-center rounded-pill border-2 border-transparent bg-dock px-1.5 shadow-lift sm:hidden"
    >
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {tabs.map(({ to, label, icon: Icon }) => (
          // The current tab's item takes the rest of the row, so its pill can hold its name.
          <li key={to} className="has-[[aria-current=page]]:grow">
            <NavLink to={to} className={({ isActive }) => cn(tab, isActive ? currentTab : otherTab)}>
              {({ isActive }) => (
                <>
                  <Icon
                    aria-hidden="true"
                    strokeWidth={2.25}
                    className={cn('shrink-0', isActive ? 'size-5' : 'size-5.5')}
                  />
                  <span className={cn(!isActive && 'sr-only')}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};
