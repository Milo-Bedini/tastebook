import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/dino/button';
import { cn } from '@/dino/cn';

type PaginationProps = {
  // Both count from 1.
  page: number;
  pageCount: number;
  // Each link's address, so the caller keeps its search and filters.
  to: (page: number) => string;
  // Kept in the history entry each link opens, so the page it opens knows it came from the pager.
  state?: unknown;
  label?: string;
};

const link = 'w-full @min-[26.25rem]:w-auto';

// Previous, "Page X of Y" and Next in that order at every width (docs/design/dino/pagination.dc.html). From 420 px of
// room they share one row; narrower, the line sits above the two links, which share the row half and half. Page 1 has
// no Previous and the last page no Next, and each link keeps its own place without the other.
export const Pagination = ({ page, pageCount, to, state, label = 'Pages' }: PaginationProps) => {
  if (pageCount <= 1) {
    return null;
  }
  return (
    <nav aria-label={label} className="@container">
      <div className="grid grid-cols-2 items-center gap-3 @min-[26.25rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[26.25rem]:gap-x-4">
        {page > 1 && (
          <Button
            asChild
            variant="secondary"
            className={cn(
              link,
              'col-start-1 row-start-2 @min-[26.25rem]:row-start-1 @min-[26.25rem]:justify-self-start'
            )}
          >
            <Link to={to(page - 1)} state={state}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Link>
          </Button>
        )}
        <p className="col-span-2 col-start-1 row-start-1 justify-self-center text-label tabular-nums @min-[26.25rem]:col-span-1 @min-[26.25rem]:col-start-2">
          {`Page ${page} of ${pageCount}`}
        </p>
        {page < pageCount && (
          <Button
            asChild
            variant="secondary"
            className={cn(
              link,
              'col-start-2 row-start-2 @min-[26.25rem]:col-start-3 @min-[26.25rem]:row-start-1 @min-[26.25rem]:justify-self-end'
            )}
          >
            <Link to={to(page + 1)} state={state}>
              Next
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </nav>
  );
};
