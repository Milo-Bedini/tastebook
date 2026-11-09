import { CircleAlert, Flag } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import type { components } from '../api/schema';
import { Button, Field, RadioList, Sheet, TextArea, toast } from '../dino';
import { useSession } from '../households';
import { openedFromList } from './recipe-card';
import { useReportRecipe } from './recipes-api';

type Recipe = components['schemas']['Recipe'];
type ReportReason = components['schemas']['ReportReason'];

// Signed out, Report recipe goes through sign-in and comes back with its sheet open.
const REPORT_PARAM = 'report';

const reasons: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'spam', label: 'Spam', hint: 'Adverts, links, or not a recipe' },
  { value: 'offensive', label: 'Offensive', hint: 'Hateful, violent or explicit' },
  { value: 'copied', label: 'Copied without credit', hint: "Someone else's recipe, passed off as theirs" },
  { value: 'other', label: 'Something else', hint: 'Say what in the note' }
];

const NO_REASON = "Choose what's wrong with it, like Spam.";
const NOT_SENT = "Couldn't send the report. Check your connection, then try again.";
const NOTE_MAX_LENGTH = 500;

const firstReason = (within: Element | null) => within?.querySelector<HTMLElement>('input[type="radio"]') ?? null;

const signInPath = (pathname: string, search: string) => {
  const params = new URLSearchParams(search);
  params.set(REPORT_PARAM, 'open');
  return `/sign-in?next=${encodeURIComponent(`${pathname}?${params.toString()}`)}`;
};

type ReportFormProps = { recipe: Recipe; onSent: (hidden: boolean) => void; onGone: () => void };

// Nothing is sent until Send report; a report that didn't send keeps its reason and note, and pressing again retries.
const ReportForm = ({ recipe, onSent, onGone }: ReportFormProps) => {
  const reportRecipe = useReportRecipe(recipe.slug);
  const { refetch: checkSession } = useSession();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [reason, setReason] = useState<ReportReason>();
  const [note, setNote] = useState('');
  const [noReason, setNoReason] = useState(false);
  const [failed, setFailed] = useState<string>();

  const choose = (chosen: ReportReason) => {
    setReason(chosen);
    setNoReason(false);
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reportRecipe.isPending) {
      return;
    }
    if (reason === undefined) {
      setNoReason(true);
      firstReason(event.currentTarget)?.focus();
      return;
    }
    setFailed(undefined);
    try {
      const result = await reportRecipe.mutateAsync({ reason, note });
      if (result.kind === 'reported') {
        onSent(result.hidden);
        return;
      }
      if (result.kind === 'refused') {
        setFailed(result.message);
        return;
      }
      if (result.kind === 'gone') {
        onGone();
        return;
      }
      const { data: account } = await checkSession();
      if (account === null) {
        await navigate(signInPath(pathname, search));
        return;
      }
      // Still signed in (a refused CSRF token, or the check failing), so nothing else says it wasn't sent.
      setFailed(NOT_SENT);
    } catch {
      setFailed(NOT_SENT);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void send(event)} className="flex flex-col gap-5">
      <RadioList
        legend="What's wrong with it?"
        name="reason"
        options={reasons}
        value={reason}
        onValueChange={choose}
        error={noReason ? NO_REASON : undefined}
      />
      <Field label="Note" help="Optional. Anything that helps staff, like where it was copied from.">
        {(control) => (
          <TextArea
            {...control}
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-col items-end gap-2">
        {failed !== undefined && (
          <p role="alert" className="flex items-start gap-1.5 self-stretch text-danger text-small">
            <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.25} />
            {failed}
          </p>
        )}
        <Button type="submit" loading={reportRecipe.isPending} loadingLabel="Sending…">
          Send report
        </Button>
      </div>
    </form>
  );
};

// Only on another household's public recipe (can_report). Signed out it goes through sign-in and comes back with the
// sheet open; once reported it stays "Reported", and a report that hid the recipe takes the reporter back.
export const RecipeReport = ({ recipe }: { recipe: Recipe }) => {
  const { account } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const askedOnReturn = Boolean(account) && !recipe.reported && searchParams.has(REPORT_PARAM);

  const changeOpen = (next: boolean) => {
    setIsOpen(next);
    if (!next && searchParams.has(REPORT_PARAM)) {
      setSearchParams(
        (params) => {
          params.delete(REPORT_PARAM);
          return params;
        },
        { replace: true }
      );
    }
  };

  const press = () => {
    if (account === null) {
      void navigate(signInPath(location.pathname, location.search));
      return;
    }
    setIsOpen(true);
  };

  const sent = (hidden: boolean) => {
    changeOpen(false);
    if (!hidden) {
      toast.success(`Reported ${recipe.title}. Staff will look at it.`);
      return;
    }
    toast.success(`Reported ${recipe.title}. It's hidden while staff look at it.`);
    // The page has nothing left to show them, so they go back where they came from, to its heading.
    const list = openedFromList(location.state);
    void navigate(list?.path ?? '/recipes', { replace: true, state: { focus: 'heading' } });
  };

  const gone = () => {
    changeOpen(false);
    toast.info(`${recipe.title} has been deleted, or you can't see it any more.`);
  };

  return (
    <>
      {recipe.reported ? (
        <Button ref={button} variant="ghost" disabled disabledReason="You've reported this recipe. Staff have it.">
          <Flag aria-hidden="true" strokeWidth={2.25} />
          Reported
        </Button>
      ) : (
        <Button ref={button} variant="ghost" aria-haspopup="dialog" onClick={press}>
          <Flag aria-hidden="true" strokeWidth={2.25} />
          Report recipe
        </Button>
      )}
      <Sheet
        title="Report recipe"
        description={recipe.author === null ? recipe.title : `${recipe.title}, by ${recipe.author}`}
        open={isOpen || askedOnReturn}
        onOpenChange={changeOpen}
        onOpenAutoFocus={(event) => {
          const first = firstReason(event.target instanceof Element ? event.target : null);
          if (first !== null) {
            event.preventDefault();
            first.focus();
          }
        }}
        // Back to the button, Report recipe or now Reported; gone, the page takes focus itself.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          button.current?.focus();
        }}
      >
        <ReportForm recipe={recipe} onSent={sent} onGone={gone} />
      </Sheet>
    </>
  );
};
