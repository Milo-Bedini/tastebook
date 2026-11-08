import { BookOpen, Library } from 'lucide-react';
import { Outlet, useLocation } from 'react-router';

import { FavouriteToggle, Hearts, SavedIn, SaveOnReturn, SaveToListButton } from '../collections';
import { Dock, type NavTab, Toaster, TopBar, type TopBarAccount, toast } from '../dino';
import { useSession, useSignOut } from '../households';
import { FavouriteSlot, SaveToListSlot, useRecipeSearch } from '../recipes';

const SIGN_IN_PATH = '/sign-in';

const FAVOURITE_PARTS = { Heart: FavouriteToggle, Hearts };

const SAVE_TO_LIST_PARTS = { Button: SaveToListButton, SavedIn };

// Signed out there's only Recipes, so no tabs at all.
const TABS: NavTab[] = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/lists', label: 'Lists', icon: Library }
];

const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";

const useAccountEnd = (): TopBarAccount | undefined => {
  const { pathname, search } = useLocation();
  const { account, isPending, isError } = useSession();
  const signOut = useSignOut();

  // Until it's known who is signed in the bar shows neither end, and the sign-in page has no use for one.
  if (isPending || isError || pathname === SIGN_IN_PATH) {
    return undefined;
  }
  if (!account) {
    return { status: 'signed-out', signInTo: `${SIGN_IN_PATH}?next=${encodeURIComponent(pathname + search)}` };
  }
  return {
    status: 'signed-in',
    name: account.name,
    menuItems: [
      { kind: 'link', label: 'Account', to: '/account' },
      { kind: 'link', label: 'Household', to: '/household' },
      {
        kind: 'action',
        label: 'Sign out',
        onSelect: () => signOut.mutate(undefined, { onError: () => toast.error(SIGN_OUT_FAILED) })
      }
    ]
  };
};

export const AppLayout = () => {
  const { searchText, changeSearchText } = useRecipeSearch();
  const account = useAccountEnd();
  const tabs = account?.status === 'signed-in' ? TABS : [];
  return (
    <FavouriteSlot value={FAVOURITE_PARTS}>
      <SaveToListSlot value={SAVE_TO_LIST_PARTS}>
        <TopBar
          searchLabel="Search recipes"
          searchValue={searchText}
          onSearchValueChange={changeSearchText}
          account={account}
          tabs={tabs}
        />
        <Outlet />
        <Dock tabs={tabs} />
        <SaveOnReturn />
        <Toaster aboveDock={tabs.length > 0} />
      </SaveToListSlot>
    </FavouriteSlot>
  );
};
