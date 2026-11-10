import { ChevronLeft, CircleAlert, Pencil, Trash2, User, Users, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorWithRetry,
  FavouriteButton,
  IconButton,
  Loading,
  Page,
  Squiggle,
  toast,
  UnavailableRecipe
} from '../dino';
import { RecipeCard } from '../recipes';
import { asksForHeading, type FocusRequest, takeFocus } from './focus-request';
import { RenameListSheet } from './list-sheets';
import {
  FAVOURITES,
  type ListAddress,
  listPath,
  type SavedList,
  type SavedRecipe,
  type Scope,
  useDeleteList,
  useList,
  useLists
} from './lists-api';
import { recipeCount } from './recipe-count';
import { SignedInOnly } from './signed-in-only';
import { useStillSignedIn } from './still-signed-in';
import { useRemoval } from './use-removal';

// The first row is in view as the list opens and holds its largest paint, so its photos skip lazy loading.
const FIRST_ROW_LENGTH = 4;

// FavouriteButton keeps its button to itself, so focus reaches it through the span round it.
const focusHeart = (element: HTMLElement | null) => element?.querySelector('button')?.focus();

const isFavourites = ({ scope, slug }: ListAddress) => scope === FAVOURITES.scope && slug === FAVOURITES.slug;

type CardActionProps = { saved: SavedRecipe; list: SavedList; takesFocus: boolean; onRemove: () => void };

// Every recipe on Favourites is saved, so its heart only unsaves; on any other list, Remove takes it out.
const CardAction = ({ saved, list, takesFocus, onRemove }: CardActionProps) => {
  const title = saved.recipe?.title ?? saved.title;
  if (isFavourites(list)) {
    return (
      <span ref={takesFocus ? focusHeart : undefined} className="contents">
        <FavouriteButton label={`Favourite ${title}`} saved onSavedChange={onRemove} />
      </span>
    );
  }
  return (
    <IconButton
      ref={takesFocus ? takeFocus : undefined}
      icon={X}
      label={`Remove ${title} from ${list.name}`}
      onClick={onRemove}
    />
  );
};

type SavedItemProps = {
  saved: SavedRecipe;
  list: SavedList;
  index: number;
  takesFocus: boolean;
  onRemove: (saved: SavedRecipe, index: number) => void;
};

const SavedItem = ({ saved, list, index, takesFocus, onRemove }: SavedItemProps) => {
  const action = (
    <CardAction saved={saved} list={list} takesFocus={takesFocus} onRemove={() => onRemove(saved, index)} />
  );
  if (saved.recipe === null) {
    return <UnavailableRecipe title={saved.title} action={action} />;
  }
  return (
    <RecipeCard
      recipe={saved.recipe}
      lean={index % 2 === 0 ? 'left' : 'right'}
      eager={index < FIRST_ROW_LENGTH}
      openedFrom={{ name: list.name, path: listPath(list) }}
      action={action}
    />
  );
};

type SavedRecipesProps = { list: SavedList; focusAt: number | null; onRemove: (index: number) => void };

// One set of remove actions for the whole list, not one per card.
const SavedRecipes = ({ list, focusAt, onRemove }: SavedRecipesProps) => {
  const removal = useRemoval(list, list.name);
  const remove = (saved: SavedRecipe, index: number) => {
    onRemove(index);
    void removal(saved);
  };
  // After the bottom card goes, the card now at the bottom takes focus.
  const focusIndex = focusAt === null ? null : Math.min(focusAt, list.saved_recipes.length - 1);
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-9 lg:gap-y-11 large-text:grid-cols-1">
      {list.saved_recipes.map((saved, index) => (
        <SavedItem
          key={saved.id}
          saved={saved}
          list={list}
          index={index}
          takesFocus={focusIndex === index}
          onRemove={remove}
        />
      ))}
    </ul>
  );
};

const browseRecipes = (
  <Button asChild variant="secondary">
    <Link to="/recipes">Browse recipes</Link>
  </Button>
);

const Empty = ({ list }: { list: SavedList }) => {
  if (isFavourites(list)) {
    return (
      <EmptyState title="Nothing saved yet" action={browseRecipes} doodle="find one you love">
        Press the heart on any recipe and it lands here, ready for when you need it.
      </EmptyState>
    );
  }
  return (
    <EmptyState title={`Nothing in ${list.name} yet`} action={browseRecipes}>
      {list.household_name === null
        ? 'Recipes you add to it show here.'
        : `Recipes anyone in ${list.household_name} adds to it show here.`}
    </EmptyState>
  );
};

// The list's first word takes the squiggle, as each page's title does.
const ListTitle = ({ name }: { name: string }) => {
  const space = name.indexOf(' ');
  if (space === -1) {
    return <Squiggle emphasis>{name}</Squiggle>;
  }
  return (
    <>
      <Squiggle emphasis>{name.slice(0, space)}</Squiggle>
      {name.slice(space)}
    </>
  );
};

// Says who sees the list; never a control. The transparent border is what forced colours outlines.
const ScopeMark = ({ householdName }: { householdName: string | null }) => {
  const Icon = householdName === null ? User : Users;
  return (
    <span className="mt-2 inline-flex min-h-6 w-fit items-center gap-1 rounded-check border-2 border-transparent bg-surface px-2 py-0.5 text-ink text-small">
      <Icon aria-hidden="true" strokeWidth={2.5} className="size-3.5 shrink-0" />
      {householdName ?? 'Just you'}
    </span>
  );
};

const deleteDescription = (list: SavedList) => {
  const count = list.saved_recipes.length;
  const recipesStay =
    count === 0
      ? 'It has no recipes yet.'
      : `Its ${recipeCount(count)} ${count === 1 ? 'stays' : 'stay'} in Tastebook and in any other list.`;
  return list.household_name === null ? recipesStay : `It goes for everyone in ${list.household_name}. ${recipesStay}`;
};

const ListActions = ({ list }: { list: SavedList }) => {
  const navigate = useNavigate();
  const deleteList = useDeleteList(list);
  const { stillSignedIn } = useStillSignedIn();

  const renamed = async (renamedList: SavedList) => {
    await navigate(listPath(renamedList), { replace: true });
    toast(`Renamed to ${renamedList.name}`);
  };

  const remove = async (): Promise<void> => {
    const failed = () =>
      toast.error("Couldn't delete the list. Check your connection, then try again.", {
        action: { label: 'Try again', onClick: () => void remove() }
      });
    try {
      const result = await deleteList.mutateAsync();
      if (result.kind === 'signed-out') {
        if (await stillSignedIn()) {
          failed();
        }
        return;
      }
      await navigate('/lists', { state: { focus: 'heading' } satisfies FocusRequest });
      toast(result.kind === 'deleted' ? `Deleted ${list.name}` : `${list.name} had already been deleted`);
    } catch {
      failed();
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <RenameListSheet
        trigger={
          <Button variant="secondary">
            <Pencil aria-hidden="true" strokeWidth={2.25} />
            Rename
          </Button>
        }
        list={list}
        onRenamed={(renamedList) => void renamed(renamedList)}
      />
      <ConfirmDialog
        trigger={
          <Button variant="ghost">
            <Trash2 aria-hidden="true" strokeWidth={2.25} />
            Delete list
          </Button>
        }
        pending={deleteList.isPending}
        pendingLabel="Deleting…"
        title={`Delete ${list.name}?`}
        description={deleteDescription(list)}
        confirmLabel="Delete list"
        onConfirm={() => void remove()}
      />
    </div>
  );
};

const ListShown = ({ list }: { list: SavedList }) => {
  // Opened as it was made: its heading takes focus.
  const isNew = asksForHeading(useLocation().state);
  // Where the last removed card was: the card now there takes focus, or the heading when none is left.
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const count = list.saved_recipes.length;
  return (
    <>
      <title>{`${list.name} · Tastebook`}</title>
      <div className="flex flex-col gap-2">
        <h1 ref={isNew || (focusAt !== null && count === 0) ? takeFocus : undefined} tabIndex={-1}>
          <ListTitle name={list.name} />
        </h1>
        <ScopeMark householdName={list.household_name} />
        {/* A status message, so a screen reader hears the count drop as a card leaves. */}
        <p role="status" className={count === 0 ? 'sr-only' : 'text-muted text-small'}>
          {recipeCount(count)}
        </p>
      </div>
      {isFavourites(list) ? null : <ListActions list={list} />}
      {count === 0 ? <Empty list={list} /> : <SavedRecipes list={list} focusAt={focusAt} onRemove={setFocusAt} />}
    </>
  );
};

const GoneBody = ({ scope }: { scope: Scope }) => {
  // Only to name the household: until it's known, or if it can't be, the household is "your household".
  const { data } = useLists();
  if (scope === 'personal') {
    return <>It's been renamed or deleted.</>;
  }
  return <>Someone in {data?.household_name ?? 'your household'} deleted it.</>;
};

// In ErrorWithRetry's place, with the way back instead of a retry: there's nothing to try again.
const ListGone = ({ scope }: { scope: Scope }) => (
  <div
    role="alert"
    className="flex w-full flex-col items-center gap-2.5 rounded-card border border-line p-6 text-center"
  >
    <title>This list has gone · Tastebook</title>
    <CircleAlert aria-hidden="true" strokeWidth={2.25} className="size-8 text-danger forced-colors:text-current" />
    <h1 ref={takeFocus} tabIndex={-1} className="font-serif text-title italic">
      This list has gone
    </h1>
    <p className="text-muted">
      <GoneBody scope={scope} />
    </p>
    <Button asChild variant="secondary" className="mt-1">
      <Link to="/lists">All lists</Link>
    </Button>
  </div>
);

const Waiting = ({ address, children }: { address: ListAddress; children: ReactNode }) => (
  <>
    <title>{isFavourites(address) ? 'Favourites · Tastebook' : 'Your list · Tastebook'}</title>
    {/* Favourites' name is known before it loads. */}
    {isFavourites(address) && (
      <h1>
        <Squiggle emphasis>Favourites</Squiggle>
      </h1>
    )}
    {children}
  </>
);

const ListDetails = ({ address }: { address: ListAddress }) => {
  const { data, errorUpdatedAt, refetch } = useList(address);
  if (data === null) {
    return <ListGone scope={address.scope} />;
  }
  if (data !== undefined) {
    return <ListShown list={data} />;
  }
  if (errorUpdatedAt > 0) {
    return (
      <Waiting address={address}>
        <ErrorWithRetry
          title={isFavourites(address) ? "Couldn't load your favourites" : "Couldn't load this list"}
          onRetry={refetch}
        >
          Check your connection, then try again.
        </ErrorWithRetry>
      </Waiting>
    );
  }
  return (
    <Waiting address={address}>
      <Loading>{isFavourites(address) ? 'Finding your favourites…' : 'Finding your list…'}</Loading>
    </Waiting>
  );
};

const AnyListPage = ({ scope }: { scope: Scope }) => {
  const { slug = '' } = useParams();
  const address = { scope, slug };
  return (
    <Page>
      <Link
        to="/lists"
        className="inline-flex min-h-11 items-center gap-1 self-start text-label no-underline hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
        All lists
      </Link>
      <SignedInOnly path={listPath(address)}>
        <ListDetails address={address} />
      </SignedInOnly>
    </Page>
  );
};

// Your own lists, Favourites among them, at /lists/<slug>.
export const ListPage = () => <AnyListPage scope="personal" />;

// The household's lists at /lists/household/<slug>, so they never clash with one of your own.
export const HouseholdListPage = () => <AnyListPage scope="household" />;
