import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import type { components } from '../api/schema';
import { ErrorWithRetry, Loading, Page, RecipePhoto, Squiggle } from '../dino';
import { useLists } from './lists-api';
import { recipeCount } from './recipe-count';
import { SignedInOnly } from './signed-in-only';

type ListSummary = components['schemas']['ListSummary'];
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

const ListRow = ({ list }: { list: ListSummary }) => (
  <li>
    <Link
      to={`/lists/${list.slug}`}
      className="flex min-h-28 items-center gap-4 rounded-card border-2 border-transparent bg-surface py-3 pr-3 pl-4 text-ink no-underline transition hover:bg-line active:bg-surface-pressed"
    >
      <Fan covers={list.covers} isEmpty={list.recipe_count === 0} />
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="font-serif text-title italic">{list.name}</span>
        <span className="text-muted text-small">
          {list.recipe_count === 0 ? 'Nothing saved yet' : recipeCount(list.recipe_count)}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5.5 shrink-0" strokeWidth={2.25} />
    </Link>
  </li>
);

const Lists = () => {
  const { data, errorUpdatedAt, refetch } = useLists();
  if (data !== undefined) {
    return (
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {data.map((list) => (
          <ListRow key={list.slug} list={list} />
        ))}
      </ul>
    );
  }
  if (errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't load your lists" onRetry={refetch}>
        Check your connection, then try again.
      </ErrorWithRetry>
    );
  }
  return <Loading>Finding your lists…</Loading>;
};

export const ListsPage = () => (
  <Page>
    <title>Your lists · Tastebook</title>
    <h1>
      Your <Squiggle emphasis>lists</Squiggle>
    </h1>
    <SignedInOnly path="/lists">
      <Lists />
    </SignedInOnly>
  </Page>
);
