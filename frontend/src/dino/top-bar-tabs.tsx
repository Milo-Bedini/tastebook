import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';

import { cn } from '@/dino/cn';

export type NavTab = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type TopBarTabsProps = {
  tabs: NavTab[];
  className?: string;
};

const tab =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-pill border-2 border-transparent px-4 text-label no-underline transition focus-visible:outline-offset-0 active:scale-97';
// The current tab sets its own forced colours, as the text backplate would otherwise hide HighlightText.
const currentTab =
  'bg-peach text-on-pastel hover:bg-peach-hover active:bg-peach-pressed max-lg:pl-3 forced-colors:border-[CanvasText] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none forced-colors:hover:bg-[Highlight] forced-colors:active:bg-[Highlight] forced-colors:focus-visible:outline-[CanvasText]';
const otherTab = 'text-ink hover:bg-surface active:bg-line max-lg:w-11 max-lg:px-0';

// Under 1024 px only the current tab is named and the others are icons, so the bar stays one row; from 1024 px every
// tab is named and none has an icon.
export const TopBarTabs = ({ tabs, className }: TopBarTabsProps) => {
  if (tabs.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Main" className={className}>
      <ul className="m-0 flex list-none items-center gap-2 p-0">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} className={({ isActive }) => cn(tab, isActive ? currentTab : otherTab)}>
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" strokeWidth={2.25} className="size-5 shrink-0 lg:hidden" />
                  <span className={cn(!isActive && 'max-lg:sr-only')}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};
