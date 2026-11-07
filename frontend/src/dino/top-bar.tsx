import { Search } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, NavLink } from 'react-router';

import { Avatar } from '@/dino/avatar';
import { Button } from '@/dino/button';
import { cn } from '@/dino/cn';
import { Field } from '@/dino/field';
import { IconButton } from '@/dino/icon-button';
import { SearchInput } from '@/dino/input';
import { Menu, type MenuItem } from '@/dino/menu';
import { type NavTab, TopBarTabs } from '@/dino/top-bar-tabs';
import { Wordmark } from '@/dino/wordmark';

export type TopBarAccount =
  | { status: 'signed-in'; name: string; menuItems: MenuItem[] }
  | { status: 'signed-out'; signInTo: string };

type TopBarProps = {
  searchLabel: string;
  searchValue: string;
  onSearchValueChange: (text: string) => void;
  // Undefined shows neither end, as today; TAS-102 also leaves it undefined while it checks who is signed in.
  account?: TopBarAccount;
  // Shown from 640 px, and only with two or more; narrower, the Dock holds them.
  tabs?: NavTab[];
};

const accountEnd = 'col-start-3 row-start-1';

const AccountMenu = ({ name, menuItems }: { name: string; menuItems: MenuItem[] }) => {
  const trimmedName = name.trim();

  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={trimmedName === '' ? 'Account' : `Account for ${trimmedName}`}
          className={cn(
            'inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill transition active:scale-94 hover:*:bg-line active:*:bg-surface-pressed aria-expanded:*:border-ink aria-expanded:*:bg-line aria-expanded:active:*:bg-surface-pressed',
            accountEnd
          )}
        >
          <Avatar name={name} />
        </button>
      }
      heading={trimmedName === '' ? undefined : trimmedName}
      items={menuItems}
    />
  );
};

// Secondary, not primary: peach is for the page's own main action.
const SignInLink = ({ signInTo }: { signInTo: string }) => (
  <Button variant="secondary" asChild className={accountEnd}>
    <Link to={signInTo}>Sign in</Link>
  </Button>
);

// The inner row has the page's width and gutters, so the wordmark lines up with the content at any width.
export const TopBar = ({ searchLabel, searchValue, onSearchValueChange, account, tabs = [] }: TopBarProps) => {
  const searchId = useId();
  const searchRef = useRef<HTMLElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // A search that's on stays visible, so the field never hides what the list is filtered by.
  const isSearchShown = isSearchOpen || searchValue !== '';

  const toggleSearch = () => {
    if (isSearchShown && searchValue === '') {
      setIsSearchOpen(false);
      return;
    }
    flushSync(() => setIsSearchOpen(true));
    // SearchInput keeps its own ref for its clear button, so focus goes through the wrapper.
    searchRef.current?.querySelector('input')?.focus();
  };

  return (
    <header className="border-line border-b pt-[env(safe-area-inset-top)]">
      <div
        className={cn(
          'mx-auto grid w-full max-w-300 items-center pr-[max(--spacing(5),env(safe-area-inset-right))] pl-[max(--spacing(5),env(safe-area-inset-left))] sm:pr-[max(--spacing(8),env(safe-area-inset-right))] sm:pl-[max(--spacing(8),env(safe-area-inset-left))]',
          // With an account end the gap narrows on a phone, so signed out fits at 320 px.
          account === undefined
            ? 'grid-cols-[minmax(0,1fr)_auto] gap-x-6'
            : 'grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 sm:gap-x-6'
        )}
      >
        <div className="flex min-h-19 items-center gap-6">
          <NavLink to="/" end className="inline-flex min-h-11 items-center text-display-l no-underline">
            <Wordmark />
          </NavLink>
          <TopBarTabs tabs={tabs} className="max-sm:hidden" />
        </div>
        <IconButton
          icon={Search}
          label={searchLabel}
          aria-expanded={isSearchShown}
          aria-controls={searchId}
          className="lg:hidden"
          onClick={toggleSearch}
        />
        <search
          id={searchId}
          ref={searchRef}
          className={cn(
            'pb-4 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:block lg:w-90 lg:pb-0',
            account === undefined ? 'col-span-2' : 'col-span-3',
            !isSearchShown && 'hidden'
          )}
        >
          <Field label={searchLabel} hideLabel>
            {(control) => (
              <SearchInput
                {...control}
                value={searchValue}
                onValueChange={(text) => {
                  // An edit keeps the field open, so clearing a search from the address doesn't hide it while focused.
                  setIsSearchOpen(true);
                  onSearchValueChange(text);
                }}
                placeholder={searchLabel}
              />
            )}
          </Field>
        </search>
        {account?.status === 'signed-in' && <AccountMenu name={account.name} menuItems={account.menuItems} />}
        {account?.status === 'signed-out' && <SignInLink signInTo={account.signInTo} />}
      </div>
    </header>
  );
};
