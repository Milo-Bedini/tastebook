import type { UseQueryResult } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import type { components } from '../api/schema';
import {
  Banner,
  Button,
  ErrorWithRetry,
  Field,
  type FieldControlProps,
  FilterChip,
  Input,
  SegmentedControl,
  Spinner,
  Switch,
  TextArea,
  toast
} from '../dino';
import { useSession } from '../households';
import { useCourses } from './courses-api';
import { useCuisines } from './cuisines-api';
import { difficulties, difficultyLabels } from './difficulty';
import { toggled } from './recipe-filters';
import type { NewRecipe, RecipeErrors, RecipeSaving } from './recipe-form-api';

type Recipe = components['schemas']['Recipe'];

type Difficulty = components['schemas']['DifficultyEnum'];

type Choice = { slug: string; name: string };

type Amount = 'serves' | 'makes';

// What's typed, as typed: the numbers stay text until Save checks them.
type Draft = {
  title: string;
  description: string;
  cuisines: string[];
  courses: string[];
  difficulty: Difficulty | '';
  onePot: boolean;
  prep: string;
  cook: string;
  extra: string;
  extraLabel: string;
  amount: Amount;
  servings: string;
  yieldAmount: string;
  yieldUnit: string;
  source: string;
  sourceUrl: string;
};

const emptyDraft: Draft = {
  title: '',
  description: '',
  cuisines: [],
  courses: [],
  difficulty: '',
  onePot: false,
  prep: '',
  cook: '',
  extra: '',
  extraLabel: '',
  amount: 'serves',
  servings: '',
  yieldAmount: '',
  yieldUnit: '',
  source: '',
  sourceUrl: ''
};

// A recipe as the form shows it: numbers as text, a missing one empty, and Makes chosen when it has a yield.
const draftOf = (recipe: Recipe): Draft => ({
  title: recipe.title,
  description: recipe.description,
  cuisines: recipe.cuisines.map(({ slug }) => slug),
  courses: recipe.courses.map(({ slug }) => slug),
  difficulty: recipe.difficulty,
  onePot: recipe.one_pot,
  prep: recipe.prep_minutes?.toString() ?? '',
  cook: recipe.cook_minutes?.toString() ?? '',
  extra: recipe.extra_minutes === 0 ? '' : recipe.extra_minutes.toString(),
  extraLabel: recipe.extra_label,
  amount: recipe.yield_amount === null ? 'serves' : 'makes',
  servings: recipe.servings?.toString() ?? '',
  yieldAmount: recipe.yield_amount?.toString() ?? '',
  yieldUnit: recipe.yield_unit,
  source: recipe.source,
  sourceUrl: recipe.source_url
});

// The fields that take focus, in the form's order, so the first in error is the first here.
const typedFields = [
  'title',
  'description',
  'prep_minutes',
  'cook_minutes',
  'extra_minutes',
  'extra_label',
  'servings',
  'yield_amount',
  'yield_unit',
  'source',
  'source_url'
] as const;

type TypedField = (typeof typedFields)[number];

const BLANK_TITLE = "Give the recipe a title, like Grandma's curry.";
const NOT_MINUTES = 'Enter whole minutes, like 20.';
const NOT_A_COUNT = 'Enter a number, like 4.';
const NO_YIELD_UNIT = 'Say what it makes, like cookies.';
const NO_EXTRA_LABEL = 'Say what the extra time is for, like marinating.';

const isBlank = (text: string) => text.trim() === '';
const isWhole = (text: string) => /^\d+$/.test(text.trim());
const isMinutes = (text: string) => isBlank(text) || isWhole(text);
const isCount = (text: string) => isBlank(text) || (isWhole(text) && Number(text) >= 1);
const numberOrNull = (text: string) => (isBlank(text) ? null : Number(text.trim()));

// Every detail but the title is optional, so a blank field is never an error.
const checkDraft = (draft: Draft): RecipeErrors => {
  const serves = draft.amount === 'serves';
  const makes = draft.amount === 'makes';
  const checks: [keyof RecipeErrors, boolean, string][] = [
    ['title', isBlank(draft.title), BLANK_TITLE],
    ['prep_minutes', !isMinutes(draft.prep), NOT_MINUTES],
    ['cook_minutes', !isMinutes(draft.cook), NOT_MINUTES],
    ['extra_minutes', !isMinutes(draft.extra), NOT_MINUTES],
    ['extra_minutes', (isBlank(draft.extra) || Number(draft.extra) === 0) && !isBlank(draft.extraLabel), NOT_MINUTES],
    ['extra_label', !isBlank(draft.extra) && Number(draft.extra) !== 0 && isBlank(draft.extraLabel), NO_EXTRA_LABEL],
    ['servings', serves && !isCount(draft.servings), NOT_A_COUNT],
    ['yield_amount', makes && !isCount(draft.yieldAmount), NOT_A_COUNT],
    ['yield_amount', makes && isBlank(draft.yieldAmount) && !isBlank(draft.yieldUnit), NOT_A_COUNT],
    ['yield_unit', makes && !isBlank(draft.yieldAmount) && isBlank(draft.yieldUnit), NO_YIELD_UNIT]
  ];
  return Object.fromEntries(checks.filter(([, fails]) => fails).map(([field, , message]) => [field, message]));
};

// Only the chosen one of servings and a yield is sent, though both keep what was typed.
const toNewRecipe = (draft: Draft): NewRecipe => ({
  title: draft.title.trim(),
  description: draft.description.trim(),
  cuisines: draft.cuisines,
  courses: draft.courses,
  difficulty: draft.difficulty,
  prep_minutes: numberOrNull(draft.prep),
  cook_minutes: numberOrNull(draft.cook),
  extra_minutes: numberOrNull(draft.extra) ?? 0,
  extra_label: draft.extraLabel.trim(),
  servings: draft.amount === 'serves' ? numberOrNull(draft.servings) : null,
  yield_amount: draft.amount === 'makes' ? numberOrNull(draft.yieldAmount) : null,
  yield_unit: draft.amount === 'makes' ? draft.yieldUnit.trim() : '',
  one_pot: draft.onePot,
  source: draft.source.trim(),
  source_url: draft.sourceUrl.trim()
});

// A refusal for a part with no field of its own (the chips, difficulty, a pair half given) shows in the banner.
const bannerMessage = (errors: RecipeErrors) =>
  errors.non_field_errors ?? errors.cuisines ?? errors.courses ?? errors.difficulty ?? errors.one_pot;

const difficultyOptions: { value: Difficulty | ''; label: string }[] = [
  { value: '', label: 'None' },
  ...difficulties.map((difficulty) => ({ value: difficulty, label: difficultyLabels[difficulty] }))
];

const amountOptions: { value: Amount; label: string }[] = [
  { value: 'serves', label: 'Serves' },
  { value: 'makes', label: 'Makes' }
];

// The unit is read after the field's own help or error.
const withUnit = (control: FieldControlProps, unitId: string): FieldControlProps => ({
  ...control,
  'aria-describedby': [control['aria-describedby'], unitId].filter(Boolean).join(' ')
});

type NumberInputProps = {
  control: FieldControlProps;
  value: string;
  onChange: (value: string) => void;
  inputRef: (element: HTMLInputElement | null) => void;
  unit?: string;
};

// Short numbers get short fields, so the width says a number goes here.
const NumberInput = ({ control, value, onChange, inputRef, unit }: NumberInputProps) => {
  const unitId = `${control.id}-unit`;
  return (
    <div className="flex items-center gap-2.5">
      <Input
        {...(unit === undefined ? control : withUnit(control, unitId))}
        ref={inputRef}
        inputMode="numeric"
        className="w-24 shrink-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {unit !== undefined && (
        <span id={unitId} className="text-muted">
          {unit}
        </span>
      )}
    </div>
  );
};

type ChipGroupProps = {
  legend: string;
  query: UseQueryResult<Choice[]>;
  loading: string;
  errorTitle: string;
  selected: string[];
  onChange: (selected: string[]) => void;
};

// Each group waits on its own list, so the rest of the form works meanwhile.
const ChipGroup = ({ legend, query, loading, errorTitle, selected, onChange }: ChipGroupProps) => {
  const { data, errorUpdatedAt, refetch } = query;
  const content = (): ReactNode => {
    if (data !== undefined) {
      return (
        <div className="flex flex-wrap gap-2">
          {data.map(({ slug, name }) => (
            <FilterChip
              key={slug}
              pressed={selected.includes(slug)}
              onPressedChange={() => onChange(toggled(selected, slug))}
            >
              {name}
            </FilterChip>
          ))}
        </div>
      );
    }
    // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
    if (errorUpdatedAt > 0) {
      return (
        <ErrorWithRetry title={errorTitle} onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      );
    }
    return (
      <p role="status" className="flex items-center gap-2.5 text-label">
        <Spinner className="size-4.5" />
        {loading}
      </p>
    );
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-busy={data === undefined && errorUpdatedAt === 0}>
      <legend className="mb-2 text-label">{legend}</legend>
      {content()}
    </fieldset>
  );
};

type SectionProps = { id: string; heading: string; children: ReactNode };

const Section = ({ id, heading, children }: SectionProps) => (
  <section aria-labelledby={id} className="flex flex-col gap-6">
    <h2 id={id}>{heading}</h2>
    {children}
  </section>
);

// Focusing on mount, so a refusal naming no field takes focus each time it appears.
const focusOnMount = (element: HTMLElement | null) => element?.focus();

type RecipeFormProps = {
  // The recipe the form starts from; an empty form without one.
  recipe?: Recipe;
  submitLabel: string;
  isSaving: boolean;
  onSave: (recipe: NewRecipe) => Promise<RecipeSaving>;
};

export const RecipeForm = ({ recipe, submitLabel, isSaving, onSave }: RecipeFormProps) => {
  const navigate = useNavigate();
  const { refetch: checkSession } = useSession();
  // Set once, so a background refetch of the recipe never overwrites what's being typed.
  const [draft, setDraft] = useState(() => (recipe === undefined ? emptyDraft : draftOf(recipe)));
  const [errors, setErrors] = useState<RecipeErrors>({});
  const fields = useRef<Partial<Record<TypedField, HTMLElement | null>>>({});

  const change =
    <Key extends keyof Draft>(key: Key) =>
    (value: Draft[Key]) =>
      setDraft((current) => ({ ...current, [key]: value }));
  const refFor = (field: TypedField) => (element: HTMLElement | null) => {
    fields.current[field] = element;
  };

  // Shows every message at once; focus goes to the first field in error, or the banner when no field is.
  const refuse = (refused: RecipeErrors) => {
    setErrors(refused);
    const first = typedFields.find((field) => refused[field] !== undefined);
    if (first !== undefined) {
      fields.current[first]?.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checked = checkDraft(draft);
    if (Object.keys(checked).length > 0) {
      refuse(checked);
      return;
    }
    setErrors({});
    try {
      const result = await onSave(toNewRecipe(draft));
      if (result.kind === 'saved') {
        // The recipe opening is the confirmation.
        await navigate(`/recipes/${result.recipe.slug}`, { replace: true });
        return;
      }
      if (result.kind === 'refused') {
        refuse(result.errors);
        return;
      }
      // Signed out meanwhile: the session's answer sends a visitor to sign-in, and back here after.
      const { data: account } = await checkSession();
      // Still signed in (a refused CSRF token, or the check failing), so nothing else says it wasn't saved.
      if (account !== null) {
        toast.error("Couldn't save the recipe. Check your connection and try again.");
      }
    } catch {
      toast.error("Couldn't save the recipe. Check your connection and try again.");
    }
  };

  const refusal = bannerMessage(errors);
  const fieldInError = typedFields.some((field) => errors[field] !== undefined);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <Field label="Title" error={errors.title}>
          {(control) => (
            <Input
              {...control}
              ref={refFor('title')}
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => change('title')(event.target.value)}
            />
          )}
        </Field>
        <Field label="Description" help="A line or two about it." error={errors.description}>
          {(control) => (
            <TextArea
              {...control}
              ref={refFor('description')}
              maxLength={300}
              value={draft.description}
              onChange={(event) => change('description')(event.target.value)}
            />
          )}
        </Field>
        <ChipGroup
          legend="Cuisines"
          query={useCuisines()}
          loading="Loading cuisines…"
          errorTitle="Couldn't load the cuisines"
          selected={draft.cuisines}
          onChange={change('cuisines')}
        />
        <ChipGroup
          legend="Courses"
          query={useCourses()}
          loading="Loading courses…"
          errorTitle="Couldn't load the courses"
          selected={draft.courses}
          onChange={change('courses')}
        />
        <div className="flex flex-col gap-1.5">
          {/* The control's own legend names it for screen readers; this one shows it, as a field's label does. */}
          <span aria-hidden="true" className="text-label">
            Difficulty
          </span>
          <div>
            <SegmentedControl
              label="Difficulty"
              options={difficultyOptions}
              value={draft.difficulty}
              onValueChange={change('difficulty')}
            />
          </div>
        </div>
        <div className="max-w-80">
          <Switch checked={draft.onePot} onCheckedChange={change('onePot')}>
            One-pot
          </Switch>
        </div>
      </div>

      <Section id="recipe-form-times" heading="Times">
        {/* Prep and cook share a row on a phone; on a laptop the extra time joins them. */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Field label="Prep time" error={errors.prep_minutes}>
            {(control) => (
              <NumberInput
                control={control}
                inputRef={refFor('prep_minutes')}
                unit="minutes"
                value={draft.prep}
                onChange={change('prep')}
              />
            )}
          </Field>
          <Field label="Cook time" error={errors.cook_minutes}>
            {(control) => (
              <NumberInput
                control={control}
                inputRef={refFor('cook_minutes')}
                unit="minutes"
                value={draft.cook}
                onChange={change('cook')}
              />
            )}
          </Field>
          <Field label="Extra time" error={errors.extra_minutes}>
            {(control) => (
              <NumberInput
                control={control}
                inputRef={refFor('extra_minutes')}
                unit="minutes"
                value={draft.extra}
                onChange={change('extra')}
              />
            )}
          </Field>
        </div>
        <Field label="What it's for" help="Marinating, resting or proving." error={errors.extra_label}>
          {(control) => (
            <Input
              {...control}
              ref={refFor('extra_label')}
              maxLength={50}
              value={draft.extraLabel}
              onChange={(event) => change('extraLabel')(event.target.value)}
            />
          )}
        </Field>
      </Section>

      <Section id="recipe-form-amount" heading="Serves or makes">
        <div>
          <SegmentedControl
            label="Serves or makes"
            options={amountOptions}
            value={draft.amount}
            onValueChange={change('amount')}
          />
        </div>
        {draft.amount === 'serves' ? (
          <Field label="How many people" error={errors.servings}>
            {(control) => (
              <NumberInput
                control={control}
                inputRef={refFor('servings')}
                value={draft.servings}
                onChange={change('servings')}
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="How many" error={errors.yield_amount}>
              {(control) => (
                <NumberInput
                  control={control}
                  inputRef={refFor('yield_amount')}
                  value={draft.yieldAmount}
                  onChange={change('yieldAmount')}
                />
              )}
            </Field>
            <Field label="What it makes" help="Cookies, flatbreads or jars." error={errors.yield_unit}>
              {(control) => (
                <Input
                  {...control}
                  ref={refFor('yield_unit')}
                  maxLength={50}
                  value={draft.yieldUnit}
                  onChange={(event) => change('yieldUnit')(event.target.value)}
                />
              )}
            </Field>
          </>
        )}
      </Section>

      <Section id="recipe-form-source" heading="Where it's from">
        <Field label="Source credit" help="Who wrote it: a book, a website or a person." error={errors.source}>
          {(control) => (
            <Input
              {...control}
              ref={refFor('source')}
              maxLength={300}
              value={draft.source}
              onChange={(event) => change('source')(event.target.value)}
            />
          )}
        </Field>
        <Field label="Source address" error={errors.source_url}>
          {(control) => (
            <Input
              {...control}
              ref={refFor('source_url')}
              type="url"
              maxLength={500}
              value={draft.sourceUrl}
              onChange={(event) => change('sourceUrl')(event.target.value)}
            />
          )}
        </Field>
      </Section>

      <div className="flex flex-col items-start gap-6">
        {refusal !== undefined && (
          <div
            ref={fieldInError ? undefined : focusOnMount}
            tabIndex={-1}
            className="w-full rounded-note focus:outline-3 focus:outline-ink"
          >
            <Banner tone="danger" title="Couldn't save the recipe">
              {refusal}
            </Banner>
          </div>
        )}
        <Button type="submit" loading={isSaving} loadingLabel="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};
