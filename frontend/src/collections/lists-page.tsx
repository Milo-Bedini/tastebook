import { ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import type { components } from '../api/schema';
import { Button, ErrorWithRetry, Loading, Page, RecipePhoto, Squiggle, toast } from '../dino';
import { asksForHeading, type FocusRequest, takeFocus } from './focus-request';
import { type ListsHousehold, NewListSheet } from './list-sheets';
import { type ListSummary, listPath, type SavedList, useLists } from './lists-api';
import { recipeCount } from './recipe-count';
import { SignedInOnly } from './signed-in-only';

type ListCover = components['schemas']['ListCover'];

const fanFrames = ['left-0 top-2 -rotate-8', 'left-5 top-1 rotate-3', 'left-10 top-2 rotate-9'] as const;

type FanProps = { covers: ListCover[]; isEmpty: boolean };

// Decorative: the list's newest photos in three small polaroids, or three dashed frames while it's empty.
const Fan = ({ covers, isEmpty }: FanProps) => (
  <span aria-hidden="true" className="relative h-20 w-24 shrink-0">
    {fanFrames.map((frame, index) => {
      const cover = covers[index];
      return (
        <span
          key={frame}
          className={`absolute flex w-14 flex-col px-1.25 pt-1.25 pb-3.5 large-text:rotate-0 ${frame} ${
            isEmpty ? 'border-2 border-field border-dashed' : 'bg-paper shadow-lift'
          }`}
        >
          <span className={`block aspect-square overflow-hidden *:size-full ${isEmpty ? '' : 'bg-line'}`}>
            {cover !== undefined && <RecipePhoto shape="card" photo={cover.photo} recipeId={cover.id} alt="" />}
          </span>
        </span>
      );
    })}
  </span>
);

// Favourites fills as you save, any other list as recipes are added to it.
const emptyNote = (list: ListSummary) =>
  list.scope === 'personal' && list.slug === 'favourites' ? 'Nothing saved yet' : 'Nothing here yet';

const ListRow = ({ list }: { list: ListSummary }) => (
  <li>
    <Link
      to={listPath(list)}
      className="flex min-h-28 items-center gap-4 rounded-card border-2 border-transparent bg-surface py-3 pr-3 pl-4 text-ink no-underline transition hover:bg-line active:bg-surface-pressed"
    >
      <Fan covers={list.covers} isEmpty={list.recipe_count === 0} />
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="break-words font-serif text-title italic">{list.name}</span>
        <span className="text-muted text-small">
          {list.recipe_count === 0 ? emptyNote(list) : recipeCount(list.recipe_count)}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5.5 shrink-0" strokeWidth={2.25} />
    </Link>
  </li>
);

const listRows = 'm-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2';

type ListGroupProps = { id: string; title: string; lists: ListSummary[]; children?: ReactNode };

// Who sees a list is said by the group it sits in, so the heading names the group for a screen reader too.
const ListGroup = ({ id, title, lists, children }: ListGroupProps) => (
  <section aria-labelledby={id} className="flex flex-col gap-3">
    <h2 id={id} className="font-serif text-title italic">
      {title}
    </h2>
    {lists.length === 0 ? (
      children
    ) : (
      <ul className={listRows}>
        {lists.map((list) => (
          <ListRow key={list.slug} list={list} />
        ))}
      </ul>
    )}
  </section>
);

type TitleProps = { action?: ReactNode };

const Title = ({ action }: TitleProps) => {
  // Back from a deleted list: the page it was on has gone, so focus starts here.
  const isBack = asksForHeading(useLocation().state);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 ref={isBack ? takeFocus : undefined} tabIndex={-1}>
        Your <Squiggle emphasis>lists</Squiggle>
      </h1>
      {action}
    </div>
  );
};

const NewList = ({ household }: { household: ListsHousehold | null }) => {
  const navigate = useNavigate();
  const made = async (list: SavedList) => {
    await navigate(listPath(list), { state: { focus: 'heading' } satisfies FocusRequest });
    toast(`Made ${list.name}`);
  };
  return (
    <NewListSheet
      trigger={
        <Button>
          <Plus aria-hidden="true" strokeWidth={2.25} />
          New list
        </Button>
      }
      household={household}
      onMade={(list) => void made(list)}
    />
  );
};

const Lists = () => {
  const { data, errorUpdatedAt, refetch } = useLists();
  if (data !== undefined) {
    const household = data.household_name;
    return (
      <>
        <Title
          action={
            <NewList household={household === null ? null : { name: household, members: data.household_members }} />
          }
        />
        <ListGroup
          id="lists-just-you"
          title="Just you"
          lists={data.lists.filter(({ scope }) => scope === 'personal')}
        />
        {household !== null && (
          <ListGroup
            id="lists-household"
            title={household}
            lists={data.lists.filter(({ scope }) => scope === 'household')}
          >
            <p className="text-muted text-small">Lists you make for {household} show here, for everyone in it.</p>
          </ListGroup>
        )}
      </>
    );
  }
  if (errorUpdatedAt > 0) {
    return (
      <>
        <Title />
        <ErrorWithRetry title="Couldn't load your lists" onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      </>
    );
  }
  return (
    <>
      <Title />
      <Loading>Finding your lists…</Loading>
    </>
  );
};

export const ListsPage = () => (
  <Page>
    <title>Your lists · Tastebook</title>
    <SignedInOnly path="/lists">
      <Lists />
    </SignedInOnly>
  </Page>
);
