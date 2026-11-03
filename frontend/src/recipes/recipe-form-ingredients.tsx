import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { type Dispatch, type ReactNode, type Ref, type SetStateAction, useMemo, useRef, useState } from 'react';

import type { components } from '../api/schema';
import {
  Button,
  Combobox,
  type ComboboxOption,
  ErrorWithRetry,
  Field,
  IconButton,
  Input,
  NativeSelect,
  Sheet,
  Spinner,
  Switch,
  toast
} from '../dino';
import { useSession } from '../households';
import { capitalise } from './capitalise';
import { formatQuantity, unitLabel, units } from './format-quantity';
import { matchesIngredient, namesIngredient } from './ingredient-match';
import { useAddIngredient, useIngredients } from './ingredients-api';
import { amountText, readAmount } from './read-amount';
import type { NewRecipe } from './recipe-form-api';

type Recipe = components['schemas']['Recipe'];
type IngredientLine = components['schemas']['IngredientLine'];
type IngredientOption = components['schemas']['IngredientOption'];
type NewIngredientLine = components['schemas']['NewIngredientLine'];
type Unit = components['schemas']['UnitEnum'];

export type LineDraft = {
  kind: 'line';
  key: string;
  ingredient: { slug: string; name: string };
  amount: string;
  unit: Unit | '';
  note: string;
  optional: boolean;
  // Kept as loaded and sent back unchanged; '' for a new line.
  originalText: string;
};
export type GroupDraft = { kind: 'group'; key: string; name: string };
export type IngredientEntry = LineDraft | GroupDraft;

// What the section shows besides the list: nothing, one entry's sheet open on a field, or the Reorder mode.
export type IngredientsView =
  | { kind: 'list' }
  | { kind: 'editing'; key: string; field: 'amount' | 'name' }
  | { kind: 'reordering' };

type Lists = { above: LineDraft[]; groups: { group: GroupDraft; lines: LineDraft[] }[] };

const isLine = (entry: IngredientEntry): entry is LineDraft => entry.kind === 'line';

// The lines from `start` up to the next group heading.
const linesFrom = (entries: IngredientEntry[], start: number) => {
  const rest = entries.slice(start);
  const end = rest.findIndex((entry) => entry.kind === 'group');
  return (end === -1 ? rest : rest.slice(0, end)).filter(isLine);
};

// The flat draft split at each group heading: the lines above every group, then each group with its own.
const listsOf = (entries: IngredientEntry[]): Lists => ({
  above: linesFrom(entries, 0),
  groups: entries.flatMap((entry, index) =>
    entry.kind === 'group' ? [{ group: entry, lines: linesFrom(entries, index + 1) }] : []
  )
});

const lineDraftOf = (line: IngredientLine): LineDraft => ({
  kind: 'line',
  key: `line-${line.id}`,
  ingredient: { slug: line.ingredient.slug, name: line.ingredient.name },
  amount: amountText(line.amount, line.amount_max),
  unit: line.unit,
  note: line.note,
  optional: line.optional,
  originalText: line.original_text
});

export const ingredientEntriesOf = (recipe: Recipe): IngredientEntry[] => [
  ...recipe.ingredient_lines.map(lineDraftOf),
  ...recipe.ingredient_groups.flatMap((group): IngredientEntry[] => [
    { kind: 'group', key: `group-${group.id}`, name: group.name },
    ...group.lines.map(lineDraftOf)
  ])
];

const amountField = (key: string) => `${key}-amount`;
const nameField = (key: string) => `${key}-name`;

const amountMessages = {
  unreadable: 'Enter an amount like 2, ½ or 2-3, or leave it empty.',
  zero: 'Enter an amount above 0, or leave it empty.',
  falling: 'Put the smaller amount first, like 2-3.'
};

const BLANK_GROUP_NAME = 'Give the group a name, like For the sauce.';

const isBlank = (text: string) => text.trim() === '';

// Keyed by field id: `${key}-amount` for a line, `${key}-name` for a group.
export const checkIngredients = (entries: IngredientEntry[]): Record<string, string> =>
  Object.fromEntries(
    entries.flatMap((entry): [string, string][] => {
      if (entry.kind === 'group') {
        return isBlank(entry.name) ? [[nameField(entry.key), BLANK_GROUP_NAME]] : [];
      }
      const reading = readAmount(entry.amount);
      return reading.kind === 'amount' ? [] : [[amountField(entry.key), amountMessages[reading.kind]]];
    })
  );

// Each entry's field in the form's order, so the first in error is the first here.
export const ingredientFieldIds = (entries: IngredientEntry[]): string[] =>
  entries.map((entry) => (entry.kind === 'line' ? amountField(entry.key) : nameField(entry.key)));

export const viewOfField = (id: string): IngredientsView =>
  id.endsWith('-amount')
    ? { kind: 'editing', key: id.slice(0, -'-amount'.length), field: 'amount' }
    : { kind: 'editing', key: id.slice(0, -'-name'.length), field: 'name' };

const toNewLine = (line: LineDraft): NewIngredientLine => {
  const reading = readAmount(line.amount);
  return {
    amount: reading.kind === 'amount' ? reading.amount : null,
    amount_max: reading.kind === 'amount' ? reading.amountMax : null,
    unit: line.unit,
    ingredient: line.ingredient.slug,
    note: line.note.trim(),
    optional: line.optional,
    original_text: line.originalText
  };
};

export const toIngredientPayload = (
  entries: IngredientEntry[]
): Required<Pick<NewRecipe, 'ingredient_lines' | 'ingredient_groups'>> => {
  const { above, groups } = listsOf(entries);
  return {
    ingredient_lines: above.map(toNewLine),
    ingredient_groups: groups.map(({ group, lines }) => ({ name: group.name.trim(), lines: lines.map(toNewLine) }))
  };
};

// The quantity, then the note, then whether it's optional: "2–3 tbsp, extra virgin · optional", "1", "To taste".
const lineDetail = (line: LineDraft) => {
  const reading = readAmount(line.amount);
  const quantity =
    reading.kind === 'amount'
      ? formatQuantity({ amount: reading.amount, amount_max: reading.amountMax, unit: line.unit })
      : [line.amount.trim(), line.unit === '' ? '' : unitLabel(line.unit)].filter(Boolean).join(' ');
  const said = [quantity, line.note.trim()].filter(Boolean).join(', ');
  return `${said === '' ? 'To taste' : said}${line.optional ? ' · optional' : ''}`;
};

const groupName = (group: GroupDraft) => group.name.trim();

// A move swaps an entry with its neighbour, so a line next to a group heading crosses it.
const moveLine = (entries: IngredientEntry[], index: number, step: 1 | -1) => {
  const line = entries[index];
  const neighbour = entries[index + step];
  if (line === undefined) {
    return { entries, message: '' };
  }
  const name = line.kind === 'line' ? line.ingredient.name : '';
  if (neighbour === undefined) {
    return { entries, message: `${capitalise(name)} is already ${step === -1 ? 'first' : 'last'}.` };
  }
  const moved = entries.with(index, neighbour).with(index + step, line);
  if (neighbour.kind === 'line') {
    return { entries: moved, message: `Moved ${name} ${step === -1 ? 'up' : 'down'}.` };
  }
  // Up past a heading, the line ends the list above it: another group's, or the lines above the groups.
  const joined = step === 1 ? neighbour : moved.slice(0, index - 1).findLast((entry) => entry.kind === 'group');
  if (joined === undefined || joined.kind !== 'group') {
    return { entries: moved, message: `Moved ${name} above the groups.` };
  }
  return { entries: moved, message: `Moved ${name} into ${groupName(joined) || 'the unnamed group'}.` };
};

const headingIndexes = (entries: IngredientEntry[]) =>
  entries.flatMap((entry, index) => (entry.kind === 'group' ? [index] : []));

// A group moves with its lines past the group before or after it; the lines above the groups stay put.
const moveGroup = (entries: IngredientEntry[], index: number, step: 1 | -1) => {
  const group = entries[index];
  const name = group?.kind === 'group' ? groupName(group) : '';
  const headings = headingIndexes(entries);
  const at = headings.indexOf(index);
  // The two neighbouring groups, as [start of the first, start of the second, end of the second].
  const [first, second, end] =
    step === -1
      ? [headings[at - 1], index, headings[at + 1] ?? entries.length]
      : [index, headings[at + 1], headings[at + 2] ?? entries.length];
  if (first === undefined || second === undefined) {
    return {
      entries,
      message: `${name || 'This group'} is already the ${step === -1 ? 'first' : 'last'} group.`
    };
  }
  const swapped = [
    ...entries.slice(0, first),
    ...entries.slice(second, end),
    ...entries.slice(first, second),
    ...entries.slice(end)
  ];
  return { entries: swapped, message: `Moved group ${name === '' ? '' : `${name} `}${step === -1 ? 'up' : 'down'}.` };
};

const removedGroupMessage = (group: GroupDraft) => {
  const name = groupName(group);
  return `Removed group${name === '' ? '' : ` ${name}`}. Its ingredients joined the list above.`;
};

const toOption = ({ slug, name, synonyms }: IngredientOption): ComboboxOption => ({
  value: slug,
  name,
  hint: synonyms.length > 0 ? `also ${synonyms.join(', ')}` : undefined
});

const couldNotAdd = (name: string) => `Couldn't add “${name}”. Check your connection and try again.`;

type LinePickerProps = {
  label: string;
  ingredients: IngredientOption[];
  onPick: (ingredient: IngredientOption) => void;
  inputRef: Ref<HTMLInputElement>;
};

// Each list has its own picker and search, and adds what the shared list doesn't have.
const LinePicker = ({ label, ingredients, onPick, inputRef }: LinePickerProps) => {
  const [search, setSearch] = useState('');
  const adding = useAddIngredient();
  const { refetch: checkSession } = useSession();
  const text = search.trim();
  const options = ingredients.filter((ingredient) => matchesIngredient(ingredient, search)).map(toOption);
  const canAdd =
    /\p{L}/u.test(text) && text.length <= 100 && !ingredients.some((ingredient) => namesIngredient(ingredient, text));

  const pick = (slug: string) => {
    const ingredient = ingredients.find((option) => option.slug === slug);
    if (ingredient !== undefined) {
      onPick(ingredient);
    }
  };

  const add = async () => {
    if (adding.isPending) {
      return;
    }
    try {
      const result = await adding.mutateAsync(text);
      if (result.kind === 'added') {
        setSearch('');
        onPick(result.ingredient);
        return;
      }
      if (result.kind === 'refused') {
        toast.error(result.message);
        return;
      }
      // Signed out meanwhile: the session's answer sends a visitor to sign-in, and back here after.
      const { data: account } = await checkSession();
      if (account !== null) {
        toast.error(couldNotAdd(text));
      }
    } catch {
      toast.error(couldNotAdd(text));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Combobox
        label={label}
        placeholder="Type an ingredient"
        options={options}
        chosen={[]}
        search={search}
        onSearchChange={setSearch}
        onChoose={pick}
        onRemove={() => undefined}
        removeLabel="Remove ingredient"
        emptyText="No ingredients match."
        addOption={canAdd ? { label: `Add “${text}”`, onAdd: add } : undefined}
        inputRef={inputRef}
      />
      <div role="status">
        {adding.isPending && (
          <p className="flex items-center gap-2.5 text-label">
            <Spinner className="size-4.5" />
            Adding “{adding.variables}”…
          </p>
        )}
      </div>
    </div>
  );
};

type RowButtonProps = {
  error?: string;
  errorId: string;
  onPress: () => void;
  buttonRef: (element: HTMLElement | null) => void;
  className?: string;
  children: ReactNode;
};

// One row that opens its entry's sheet. The error is read as its description, not as part of its name.
const RowButton = ({ error, errorId, onPress, buttonRef, className, children }: RowButtonProps) => (
  <button
    type="button"
    ref={buttonRef}
    aria-describedby={error === undefined ? undefined : errorId}
    onClick={onPress}
    className={`-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-row p-2 text-left hover:bg-surface ${className ?? 'min-h-16'}`}
  >
    <span className="flex min-w-0 grow flex-col gap-0.5">
      {children}
      {error !== undefined && (
        <span
          id={errorId}
          aria-hidden="true"
          className="flex items-start gap-1.5 font-sans text-danger text-small not-italic"
        >
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.5} />
          {error}
        </span>
      )}
    </span>
    <ChevronRight aria-hidden="true" strokeWidth={2.5} className="size-5 shrink-0 text-muted" />
  </button>
);

type MoveButtonsProps = {
  name: string;
  onMove: (step: 1 | -1) => void;
  focusRef: (step: 1 | -1) => ((element: HTMLElement | null) => void) | undefined;
};

const MoveButtons = ({ name, onMove, focusRef }: MoveButtonsProps) => (
  <span className="flex shrink-0 gap-2">
    <IconButton icon={ArrowUp} label={`Move ${name} up`} ref={focusRef(-1)} onClick={() => onMove(-1)} />
    <IconButton icon={ArrowDown} label={`Move ${name} down`} ref={focusRef(1)} onClick={() => onMove(1)} />
  </span>
);

const rowsClassName = 'flex flex-col divide-y divide-line';

type LineSheetFieldsProps = {
  line: LineDraft;
  errors: Record<string, string>;
  onChange: (line: LineDraft) => void;
  amountRef: Ref<HTMLInputElement>;
  onDone: () => void;
  onRemove: () => void;
};

const LineSheetFields = ({ line, errors, onChange, amountRef, onDone, onRemove }: LineSheetFieldsProps) => {
  const id = `ingredient-sheet-${line.key}`;
  const error = errors[amountField(line.key)];
  const change = (changes: Partial<LineDraft>) => onChange({ ...line, ...changes });
  return (
    <div className="flex flex-col gap-4">
      {/* Amount and Unit share a row, with Amount's help under both. */}
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-amount`} className="text-label">
              Amount
            </label>
            <Input
              id={`${id}-amount`}
              ref={amountRef}
              aria-describedby={`${id}-amount-description`}
              aria-invalid={error === undefined ? undefined : true}
              value={line.amount}
              onChange={(event) => change({ amount: event.target.value })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-unit`} className="text-label">
              Unit
            </label>
            <NativeSelect
              id={`${id}-unit`}
              value={line.unit}
              onChange={(event) => change({ unit: event.target.value as Unit | '' })}
            >
              <option value="">No unit</option>
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unitLabel(unit)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {error === undefined ? (
          <p id={`${id}-amount-description`} className="text-muted text-small">
            Like 2, ½ or 2-3. Leave it empty for “to taste”.
          </p>
        ) : (
          <p id={`${id}-amount-description`} className="flex items-start gap-1.5 text-danger text-small">
            <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.5} />
            {error}
          </p>
        )}
      </div>
      <Field label="Note" help="Like finely chopped.">
        {(control) => (
          <Input
            {...control}
            maxLength={200}
            value={line.note}
            onChange={(event) => change({ note: event.target.value })}
          />
        )}
      </Field>
      <Switch checked={line.optional} onCheckedChange={(optional) => change({ optional })}>
        Optional, can be left out
      </Switch>
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="secondary" onClick={onRemove}>
          <Trash2 aria-hidden="true" strokeWidth={2.5} />
          Remove {line.ingredient.name}
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
};

type GroupSheetFieldsProps = {
  group: GroupDraft;
  errors: Record<string, string>;
  onChange: (group: GroupDraft) => void;
  nameRef: Ref<HTMLInputElement>;
  onDone: () => void;
  onRemove: () => void;
};

const GroupSheetFields = ({ group, errors, onChange, nameRef, onDone, onRemove }: GroupSheetFieldsProps) => (
  <div className="flex flex-col gap-4">
    <Field label="Group name" help="Like For the sauce or To serve." error={errors[nameField(group.key)]}>
      {(control) => (
        <Input
          {...control}
          ref={nameRef}
          maxLength={100}
          value={group.name}
          onChange={(event) => onChange({ ...group, name: event.target.value })}
        />
      )}
    </Field>
    <div className="flex items-center justify-between gap-3 pt-1">
      <Button variant="secondary" onClick={onRemove}>
        <Trash2 aria-hidden="true" strokeWidth={2.5} />
        Remove group
      </Button>
      <Button onClick={onDone}>Done</Button>
    </div>
  </div>
);

// Where focus goes once a removed entry's sheet has closed: its list's picker, or "Add a group".
type Removed = { entry: IngredientEntry; listKey: string | null };

const ABOVE_THE_GROUPS = 'above';

const listKeyOf = (entries: IngredientEntry[], index: number) =>
  entries.slice(0, index).findLast((entry) => entry.kind === 'group')?.key ?? ABOVE_THE_GROUPS;

const newKey = () => crypto.randomUUID();

type IngredientsSectionProps = {
  entries: IngredientEntry[];
  onChange: Dispatch<SetStateAction<IngredientEntry[]>>;
  view: IngredientsView;
  onViewChange: (view: IngredientsView) => void;
  errors: Record<string, string>;
  fieldRef: (id: string) => (element: HTMLElement | null) => void;
};

export const IngredientsSection = ({
  entries,
  onChange,
  view,
  onViewChange,
  errors,
  fieldRef
}: IngredientsSectionProps) => {
  const { data: ingredients, errorUpdatedAt, refetch } = useIngredients();
  const [announcement, setAnnouncement] = useState('');
  const [lastMove, setLastMove] = useState<{ key: string; step: 1 | -1 } | null>(null);
  // The entry the sheet shows, kept while it slides out after closing, and after its entry is removed.
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const sheetField = useRef<HTMLInputElement>(null);
  const rows = useRef<Record<string, HTMLElement | null>>({});
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});
  const addGroupButton = useRef<HTMLButtonElement>(null);

  if (view.kind === 'editing' && view.key !== sheetKey) {
    setSheetKey(view.key);
    setRemoved(null);
  }

  // A new callback for each move, so React hands it the moved button even when it kept the same element.
  const takeMoveFocus = useMemo(
    () => (lastMove === null ? null : (element: HTMLElement | null) => element?.focus()),
    [lastMove]
  );

  const reordering = view.kind === 'reordering';
  const { above, groups } = listsOf(entries);
  const sheetEntry =
    entries.find(({ key }) => key === sheetKey) ?? (removed?.entry.key === sheetKey ? removed?.entry : undefined);

  const rowRef = (id: string, key: string) => (element: HTMLElement | null) => {
    rows.current[key] = element;
    fieldRef(id)(element);
  };

  const edit = (entry: IngredientEntry) =>
    onViewChange({ kind: 'editing', key: entry.key, field: entry.kind === 'line' ? 'amount' : 'name' });

  const replace = (entry: IngredientEntry) =>
    onChange(entries.map((current) => (current.key === entry.key ? entry : current)));

  // A picked line ends its own list: the one above the groups, or its group's.
  const addLine = (listKey: string, ingredient: IngredientOption) => {
    const line: LineDraft = {
      kind: 'line',
      key: newKey(),
      ingredient: { slug: ingredient.slug, name: ingredient.name },
      amount: '',
      unit: '',
      note: '',
      optional: false,
      originalText: ''
    };
    // An added ingredient arrives after its request, so the line joins the entries as they are then.
    onChange((current) => {
      const groupAt = current.findIndex(({ key }) => key === listKey);
      const nextGroup = current.findIndex((entry, index) => index > groupAt && entry.kind === 'group');
      return current.toSpliced(nextGroup === -1 ? current.length : nextGroup, 0, line);
    });
    edit(line);
  };

  const addGroup = () => {
    const group: GroupDraft = { kind: 'group', key: newKey(), name: '' };
    onChange([...entries, group]);
    edit(group);
  };

  const remove = (entry: IngredientEntry) => {
    const index = entries.findIndex(({ key }) => key === entry.key);
    setRemoved({ entry, listKey: entry.kind === 'line' ? listKeyOf(entries, index) : null });
    onChange(entries.filter(({ key }) => key !== entry.key));
    onViewChange({ kind: 'list' });
    setAnnouncement(entry.kind === 'line' ? `Removed ${entry.ingredient.name}.` : removedGroupMessage(entry));
  };

  const move = (entry: IngredientEntry, step: 1 | -1) => {
    const index = entries.findIndex(({ key }) => key === entry.key);
    const result = entry.kind === 'line' ? moveLine(entries, index, step) : moveGroup(entries, index, step);
    if (result.entries !== entries) {
      onChange(result.entries);
    }
    setAnnouncement(result.message);
    setLastMove({ key: entry.key, step });
  };

  const focusRefFor = (key: string) => (step: 1 | -1) =>
    lastMove?.key === key && lastMove.step === step && takeMoveFocus !== null ? takeMoveFocus : undefined;

  const closeFocus = (event: Event) => {
    event.preventDefault();
    if (removed === null) {
      if (sheetKey !== null) {
        rows.current[sheetKey]?.focus();
      }
      return;
    }
    const picker = removed.listKey === null ? null : pickers.current[removed.listKey];
    (picker ?? addGroupButton.current)?.focus();
  };

  const toggleReordering = () => {
    setAnnouncement('');
    setLastMove(null);
    onViewChange(reordering ? { kind: 'list' } : { kind: 'reordering' });
  };

  const picker = (listKey: string, label: string) =>
    ingredients !== undefined && (
      <LinePicker
        label={label}
        ingredients={ingredients}
        onPick={(ingredient) => addLine(listKey, ingredient)}
        inputRef={(element) => {
          pickers.current[listKey] = element;
        }}
      />
    );

  const lineRow = (line: LineDraft) => (
    <li key={line.key}>
      {reordering ? (
        <div className="flex min-h-16 items-center justify-between gap-3 py-1.5">
          <span className="min-w-0 break-words text-label-l">{capitalise(line.ingredient.name)}</span>
          <MoveButtons
            name={line.ingredient.name}
            onMove={(step) => move(line, step)}
            focusRef={focusRefFor(line.key)}
          />
        </div>
      ) : (
        <RowButton
          error={errors[amountField(line.key)]}
          errorId={`${line.key}-error`}
          onPress={() => edit(line)}
          buttonRef={rowRef(amountField(line.key), line.key)}
        >
          {/* The space is dropped from the column's layout but kept in the button's accessible name. */}
          <span className="block break-words text-label-l">{capitalise(line.ingredient.name)}</span>{' '}
          <span className="block text-muted">{lineDetail(line)}</span>
        </RowButton>
      )}
    </li>
  );

  const lineRows = (lines: LineDraft[]) => lines.length > 0 && <ul className={rowsClassName}>{lines.map(lineRow)}</ul>;

  const pickerStatus = (): ReactNode => {
    if (ingredients !== undefined || reordering) {
      return null;
    }
    // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
    if (errorUpdatedAt > 0) {
      return (
        <ErrorWithRetry key={errorUpdatedAt} title="Couldn't load the ingredients" onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      );
    }
    return (
      <p role="status" className="flex items-center gap-2.5 text-label">
        <Spinner className="size-4.5" />
        Loading ingredients…
      </p>
    );
  };

  const sheetTitle = sheetEntry?.kind === 'line' ? capitalise(sheetEntry.ingredient.name) : 'Group';

  const sheetDescription = (): string | undefined => {
    if (sheetEntry === undefined) {
      return undefined;
    }
    if (sheetEntry.kind === 'group') {
      return 'Its name heads its ingredients on the recipe.';
    }
    const index = entries.findIndex(({ key }) => key === sheetEntry.key);
    if (index === -1) {
      return undefined;
    }
    const group = entries.slice(0, index).findLast((entry) => entry.kind === 'group');
    if (group?.kind === 'group') {
      return groupName(group) === '' ? 'In this group' : `In ${groupName(group)}`;
    }
    return groups.length > 0 ? 'Above the groups' : undefined;
  };

  const closeSheet = () => onViewChange({ kind: 'list' });

  return (
    <section aria-labelledby="recipe-form-ingredients" className="flex flex-col gap-6">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="recipe-form-ingredients">Ingredients</h2>
        {entries.length >= 2 && (
          <Button variant="secondary" onClick={toggleReordering}>
            <ArrowUpDown aria-hidden="true" strokeWidth={2.5} />
            {reordering ? 'Done reordering' : 'Reorder'}
          </Button>
        )}
      </div>
      {/* Shown in the Reorder mode, so the last move stays on screen; only announced otherwise. */}
      <p role="status" className={reordering && announcement !== '' ? 'text-label' : 'sr-only'}>
        {announcement}
      </p>
      {!reordering && (
        <p className="text-muted">
          Pick each ingredient from the list, or add one it doesn't have. Press an ingredient to set its amount, note
          and whether it's optional.
        </p>
      )}
      {pickerStatus()}
      {lineRows(above)}
      {!reordering && picker(ABOVE_THE_GROUPS, 'Add an ingredient')}
      {groups.map(({ group, lines }) => {
        const name = groupName(group);
        const headingId = `${group.key}-heading`;
        return (
          <section
            key={group.key}
            aria-labelledby={headingId}
            className="flex flex-col gap-3 border-line border-t-2 pt-3"
          >
            {reordering ? (
              <div className="flex min-h-16 items-center justify-between gap-3 py-1.5">
                <h3 id={headingId} className="min-w-0 break-words">
                  {name || 'Unnamed group'}
                </h3>
                <MoveButtons
                  name={name === '' ? 'group' : `group ${name}`}
                  onMove={(step) => move(group, step)}
                  focusRef={focusRefFor(group.key)}
                />
              </div>
            ) : (
              <h3 id={headingId}>
                <RowButton
                  error={errors[nameField(group.key)]}
                  errorId={`${group.key}-error`}
                  onPress={() => edit(group)}
                  buttonRef={rowRef(nameField(group.key), group.key)}
                  className="min-h-13"
                >
                  <span className="block break-words">{name || 'Unnamed group'}</span>
                </RowButton>
              </h3>
            )}
            {(lines.length > 0 || !reordering) && (
              <div className="flex flex-col gap-4 border-line border-l-2 pl-4">
                {lineRows(lines)}
                {!reordering && picker(group.key, `Add an ingredient to ${name || 'this group'}`)}
              </div>
            )}
          </section>
        );
      })}
      {!reordering && (
        <div>
          <Button ref={addGroupButton} variant="secondary" onClick={addGroup}>
            <Plus aria-hidden="true" strokeWidth={2.5} />
            Add a group
          </Button>
        </div>
      )}
      <Sheet
        title={sheetTitle}
        description={sheetDescription()}
        open={view.kind === 'editing'}
        onOpenChange={(open) => {
          if (!open) {
            closeSheet();
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          sheetField.current?.focus();
        }}
        onCloseAutoFocus={closeFocus}
      >
        {sheetEntry?.kind === 'line' && (
          <LineSheetFields
            line={sheetEntry}
            errors={errors}
            onChange={replace}
            amountRef={sheetField}
            onDone={closeSheet}
            onRemove={() => remove(sheetEntry)}
          />
        )}
        {sheetEntry?.kind === 'group' && (
          <GroupSheetFields
            group={sheetEntry}
            errors={errors}
            onChange={replace}
            nameRef={sheetField}
            onDone={closeSheet}
            onRemove={() => remove(sheetEntry)}
          />
        )}
      </Sheet>
    </section>
  );
};
