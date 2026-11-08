import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import { Button, Field, Input, SegmentedControl, Sheet, toast } from '../dino';
import {
  LIST_NAME_MAX_LENGTH,
  type ListChange,
  NO_LIST_NAME,
  type SavedList,
  type Scope,
  useMakeList,
  useRenameList
} from './lists-api';
import { useStillSignedIn } from './still-signed-in';

type NameFormProps = {
  initialName: string;
  help: string;
  submitLabel: string;
  submittingLabel: string;
  failure: string;
  // The rest of the form, between the name and its button.
  children?: ReactElement;
  submit: (name: string) => Promise<ListChange>;
  onSaved: (list: SavedList) => void;
  onGone?: () => void;
};

// The name, and what's refused about it, for making a list and renaming one.
const NameForm = ({
  initialName,
  help,
  submitLabel,
  submittingLabel,
  failure,
  children,
  submit,
  onSaved,
  onGone
}: NameFormProps) => {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const { stillSignedIn } = useStillSignedIn();

  const refuse = (message: string) => {
    setError(message);
    nameRef.current?.focus();
  };

  const save = async (): Promise<void> => {
    const failed = () => toast.error(failure, { action: { label: 'Try again', onClick: () => void save() } });
    setError(undefined);
    const trimmed = name.trim();
    if (trimmed === '') {
      refuse(NO_LIST_NAME);
      return;
    }
    setIsSaving(true);
    try {
      const result = await submit(trimmed);
      if (result.kind === 'saved') {
        onSaved(result.list);
      } else if (result.kind === 'refused') {
        refuse(result.message);
      } else if (result.kind === 'gone') {
        onGone?.();
      } else if (await stillSignedIn()) {
        failed();
      }
    } catch {
      failed();
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Name" help={help} error={error}>
        {(control) => (
          <Input
            {...control}
            ref={nameRef}
            autoComplete="off"
            maxLength={LIST_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      {children}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="submit" loading={isSaving} loadingLabel={submittingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

// Focus starts in the name, selected, ready to type over.
const focusName = (event: Event) => {
  event.preventDefault();
  const field = event.target instanceof HTMLElement ? event.target.querySelector('input') : null;
  field?.focus();
  field?.select();
};

const scopes: { value: Scope; label: string }[] = [
  { value: 'personal', label: 'Just you' },
  { value: 'household', label: 'Household' }
];

export type ListsHousehold = { name: string; members: number };

const whoSeesNewList = (scope: Scope, household: ListsHousehold) => {
  if (scope === 'personal') {
    return 'Only you see it.';
  }
  // Nobody else has joined yet: whoever does will share it.
  return household.members > 1
    ? `Everyone in ${household.name} sees it and can change it.`
    : `Everyone who joins ${household.name} will see it and can change it.`;
};

type NewListSheetProps = {
  trigger: ReactElement;
  // Null for an account with no household yet, which can only make a list of its own.
  household: ListsHousehold | null;
  onMade: (list: SavedList) => void;
};

// Who it's for starts on "Just you", so the quickest way through makes nothing anyone else sees.
export const NewListSheet = ({ trigger, household, onMade }: NewListSheetProps) => {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('personal');
  const makeList = useMakeList();

  const made = (list: SavedList) => {
    setOpen(false);
    onMade(list);
  };

  return (
    <Sheet
      trigger={trigger}
      title="New list"
      open={open}
      onOpenAutoFocus={focusName}
      onOpenChange={(next) => {
        setOpen(next);
        setScope('personal');
      }}
    >
      <NameForm
        initialName=""
        help="Like Weeknight dinners."
        submitLabel="Make list"
        submittingLabel="Making…"
        failure="Couldn't make the list. Check your connection, then try again."
        submit={(name) => makeList.mutateAsync({ name, scope })}
        onSaved={made}
      >
        {household === null ? undefined : (
          <SegmentedControl
            label="Who's it for?"
            labelVisible
            description={whoSeesNewList(scope, household)}
            options={scopes}
            value={scope}
            onValueChange={setScope}
          />
        )}
      </NameForm>
    </Sheet>
  );
};

type RenameListSheetProps = { trigger: ReactElement; list: SavedList; onRenamed: (list: SavedList) => void };

// Who it's for doesn't change, so the sheet only says who sees it. A list deleted meanwhile closes it, and the page
// says the list has gone.
export const RenameListSheet = ({ trigger, list, onRenamed }: RenameListSheetProps) => {
  const [open, setOpen] = useState(false);
  const renameList = useRenameList(list);

  return (
    <Sheet trigger={trigger} title="Rename list" open={open} onOpenChange={setOpen} onOpenAutoFocus={focusName}>
      <NameForm
        initialName={list.name}
        help={
          list.household_name === null
            ? 'Only you see this list.'
            : `Everyone in ${list.household_name} sees this list.`
        }
        submitLabel="Save name"
        submittingLabel="Saving…"
        failure="Couldn't rename the list. Check your connection, then try again."
        submit={(name) => renameList.mutateAsync(name)}
        onSaved={(renamed) => {
          setOpen(false);
          onRenamed(renamed);
        }}
        onGone={() => setOpen(false)}
      />
    </Sheet>
  );
};
