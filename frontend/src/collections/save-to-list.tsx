import { ListPlus } from 'lucide-react';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Button, ErrorWithRetry, ListPicker, ListPickerRow, Sheet, Spinner } from '../dino';
import { useSession } from '../households';
import type { FavouriteTarget } from '../recipes';
import {
  type ListAddress,
  type ListPlace,
  listPath,
  type RecipeLists,
  useRecipeLists,
  useSaveTo,
  useUnsaveFrom
} from './lists-api';
import { recipeCount } from './recipe-count';
import { type Asked, SAVE_TO_LIST_PARAM, useStillSignedIn } from './still-signed-in';

type SaveToListProps = { recipe: FavouriteTarget };

// Signed out, a tick that can't be saved goes through sign-in and comes back with the sheet open again.
const REOPEN: Asked = [SAVE_TO_LIST_PARAM, 'open'];

const NAMED = 3;

const isFavourites = ({ scope, slug }: ListAddress) => scope === 'personal' && slug === 'favourites';

const keyOf = ({ scope, slug }: ListAddress) => `${scope}/${slug}`;

// Favourites fills as you save, any other list as recipes are added to it: the Lists page's words.
const countOf = (place: ListPlace, count: number) => {
  if (count > 0) {
    return recipeCount(count);
  }
  return isFavourites(place) ? 'Nothing saved yet' : 'Nothing here yet';
};

const joined = (parts: ReactNode[]) =>
  parts.flatMap((part, index) => {
    if (index === 0) {
      return [part];
    }
    return [index === parts.length - 1 ? ' and ' : ', ', part];
  });

// Names each list that holds the recipe, in the sheet's order, Favourites included: three at most, then how many more.
export const SavedIn = ({ recipe }: SaveToListProps) => {
  const { account } = useSession();
  const { data } = useRecipeLists(recipe.slug, { enabled: Boolean(account) });
  const holding = account ? (data?.lists ?? []).filter(({ saved_id }) => saved_id !== null) : [];
  if (holding.length === 0) {
    return null;
  }
  const named = holding.slice(0, NAMED);
  const more = holding.length - named.length;
  const links = named.map((place) => (
    <Link key={keyOf(place)} to={listPath(place)}>
      {place.name}
    </Link>
  ));
  return (
    <p className="text-muted">
      Saved in {joined(more === 0 ? links : [...links, `${more} more ${more === 1 ? 'list' : 'lists'}`])}.
    </p>
  );
};

type Changing = { checked: boolean };

type PickerProps = { recipe: FavouriteTarget; lists: RecipeLists };

// Each tick saves at once and each untick removes at once, as the heart does; the row is busy until the answer, and
// one that didn't go through turns back and says why under itself until the next tick.
const Picker = ({ recipe, lists }: PickerProps) => {
  const saveTo = useSaveTo(recipe.slug);
  const unsaveFrom = useUnsaveFrom(recipe.slug);
  const { stillSignedIn } = useStillSignedIn();
  const [changing, setChanging] = useState<Record<string, Changing>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [said, setSaid] = useState('');

  const save = async (place: ListPlace): Promise<string | null> => {
    const failed = `Couldn't save it to ${place.name}. Check your connection, then tick it again.`;
    try {
      const result = await saveTo.mutateAsync(place);
      if (result.kind === 'saved') {
        setSaid(`Saved to ${place.name}`);
        return null;
      }
      if (result.kind === 'gone') {
        return `Couldn't save it to ${place.name}: the list or this recipe has gone.`;
      }
      return (await stillSignedIn(REOPEN)) ? failed : null;
    } catch {
      return failed;
    }
  };

  const remove = async (place: ListPlace, savedId: number): Promise<string | null> => {
    const failed = `Couldn't remove it from ${place.name}. Check your connection, then untick it again.`;
    try {
      const result = await unsaveFrom.mutateAsync({ address: place, savedId });
      // Gone is removed too: it was taken out already, elsewhere.
      if (result.kind !== 'signed-out') {
        setSaid(`Removed from ${place.name}`);
        return null;
      }
      return (await stillSignedIn(REOPEN)) ? failed : null;
    } catch {
      return failed;
    }
  };

  const change = async (place: ListPlace, checked: boolean) => {
    const key = keyOf(place);
    setErrors({});
    setChanging((rows) => ({ ...rows, [key]: { checked } }));
    const error = checked || place.saved_id === null ? await save(place) : await remove(place, place.saved_id);
    setChanging((rows) => Object.fromEntries(Object.entries(rows).filter(([row]) => row !== key)));
    if (error !== null) {
      setErrors((rows) => ({ ...rows, [key]: error }));
    }
  };

  const row = (place: ListPlace) => {
    const key = keyOf(place);
    const pending = changing[key];
    const holds = place.saved_id !== null;
    const checked = pending?.checked ?? holds;
    // The count moves with the tick, before the answer.
    const count = place.recipe_count + (pending === undefined || pending.checked === holds ? 0 : checked ? 1 : -1);
    return (
      <ListPickerRow
        key={key}
        name={place.name}
        count={countOf(place, count)}
        checked={checked}
        saving={pending !== undefined}
        error={errors[key]}
        onCheckedChange={(next) => void change(place, next)}
      />
    );
  };

  const own = lists.lists.filter(({ scope }) => scope === 'personal');
  const household = lists.lists.filter(({ scope }) => scope === 'household');

  return (
    <div className="flex flex-col gap-4">
      <ListPicker legend="Just you">{own.map(row)}</ListPicker>
      {lists.household_name !== null &&
        (household.length > 0 ? (
          <ListPicker legend={lists.household_name}>{household.map(row)}</ListPicker>
        ) : (
          <section aria-labelledby="save-to-list-household" className="flex flex-col">
            <h3 id="save-to-list-household" className="pb-1.5 text-label">
              {lists.household_name}
            </h3>
            <p className="px-3 pb-1 text-muted text-small">
              Lists you make for {lists.household_name} show here, for everyone in it.
            </p>
          </section>
        ))}
      <p className="text-muted text-small">
        Make another list on the <Link to="/lists">Lists</Link> page.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
};

const SheetBody = ({ recipe }: SaveToListProps) => {
  const { data, errorUpdatedAt, refetch } = useRecipeLists(recipe.slug);
  if (data !== undefined) {
    return <Picker recipe={recipe} lists={data} />;
  }
  // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its
  // retry.
  if (errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't load your lists" onRetry={refetch}>
        Check your connection, then try again.
      </ErrorWithRetry>
    );
  }
  // At the height of a short list, so the sheet doesn't jump much when the lists arrive.
  return (
    <p
      role="status"
      aria-busy="true"
      className="flex min-h-30 animate-reveal items-center justify-center gap-2.5 text-muted"
    >
      <Spinner className="size-5" />
      Finding your lists…
    </p>
  );
};

// Focus starts on the first list, once there are lists to start on; until then it's on Close.
const focusFirstList = (event: Event) => {
  const first =
    event.target instanceof HTMLElement ? event.target.querySelector<HTMLElement>('[role="checkbox"]') : null;
  if (first !== null) {
    event.preventDefault();
    first.focus();
  }
};

// Signed out it goes through sign-in and comes back with the sheet open; closing the sheet drops that from the address.
export const SaveToListButton = ({ recipe }: SaveToListProps) => {
  const { account } = useSession();
  const { signIn } = useStillSignedIn();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const askedOnReturn = Boolean(account) && searchParams.has(SAVE_TO_LIST_PARAM);

  const changeOpen = (next: boolean) => {
    setIsOpen(next);
    if (!next && searchParams.has(SAVE_TO_LIST_PARAM)) {
      setSearchParams(
        (params) => {
          params.delete(SAVE_TO_LIST_PARAM);
          return params;
        },
        { replace: true }
      );
    }
  };

  const press = (event: MouseEvent<HTMLButtonElement>) => {
    if (account === null) {
      // Kept shut: the sheet opens on the way back.
      event.preventDefault();
      void signIn(REOPEN);
    }
  };

  return (
    <Sheet
      trigger={
        <Button variant="secondary" onClick={press}>
          <ListPlus aria-hidden="true" strokeWidth={2.25} />
          Save to list
        </Button>
      }
      title="Save to a list"
      description={recipe.title}
      open={isOpen || askedOnReturn}
      onOpenChange={changeOpen}
      onOpenAutoFocus={focusFirstList}
    >
      <SheetBody recipe={recipe} />
    </Sheet>
  );
};
