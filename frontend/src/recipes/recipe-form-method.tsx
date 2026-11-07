import { ArrowDown, ArrowUp, ArrowUpDown, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { type ClipboardEvent, type Dispatch, type ReactNode, type SetStateAction, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { components } from '../api/schema';
import { Button, IconButton, TextArea } from '../dino';

type Recipe = components['schemas']['Recipe'];

export type StepDraft = { key: string; text: string };

const newKey = () => crypto.randomUUID();

// A recipe with no method opens with one blank step, ready to type into.
export const stepDraftsOf = (recipe: Recipe): StepDraft[] =>
  recipe.steps.length === 0
    ? [{ key: newKey(), text: '' }]
    : recipe.steps.map(({ id, text }) => ({ key: `step-${id}`, text }));

const stepField = (key: string) => `${key}-text`;

// Each step's field in the form's order, so the first in error is the first here.
export const stepFieldIds = (steps: StepDraft[]): string[] => steps.map(({ key }) => stepField(key));

const isBlank = (text: string) => text.trim() === '';

// Blank steps are left out, so a spare empty box never stops a save.
export const toStepPayload = (steps: StepDraft[]): string[] =>
  steps.filter(({ text }) => !isBlank(text)).map(({ text }) => text.trim());

// The API keys a refused step by its place among the steps sent, which skip the blank ones; the form keys it by field.
export const stepErrorsOf = (steps: StepDraft[], refused: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    steps
      .filter(({ text }) => !isBlank(text))
      .flatMap(({ key }, index) => {
        const message = refused[index.toString()];
        return message === undefined ? [] : [[stepField(key), message]];
      })
  );

const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');

const numberClassName = 'font-serif text-method-number text-pop italic';

type MethodSectionProps = {
  steps: StepDraft[];
  onChange: Dispatch<SetStateAction<StepDraft[]>>;
  reordering: boolean;
  onReorderingChange: (reordering: boolean) => void;
  errors: Record<string, string>;
  fieldRef: (id: string) => (element: HTMLElement | null) => void;
  // The equipment's chip group, which the Reorder mode hides with the text areas.
  equipment: ReactNode;
};

export const MethodSection = ({
  steps,
  onChange,
  reordering,
  onReorderingChange,
  errors,
  fieldRef,
  equipment
}: MethodSectionProps) => {
  const [announcement, setAnnouncement] = useState('');
  const textAreas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const moveButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const addButton = useRef<HTMLButtonElement>(null);

  const textAreaRef = (key: string) => (element: HTMLTextAreaElement | null) => {
    textAreas.current[key] = element;
    fieldRef(stepField(key))(element);
  };

  const write = (key: string, text: string) =>
    onChange((current) => current.map((step) => (step.key === key ? { ...step, text } : step)));

  // Focus moves once the steps have rendered, so it can land on a step that's only just there.
  const add = () => {
    const step = { key: newKey(), text: '' };
    flushSync(() => onChange((current) => [...current, step]));
    textAreas.current[step.key]?.focus();
  };

  const remove = (index: number) => {
    const remaining = steps.toSpliced(index, 1);
    flushSync(() => {
      onChange(remaining);
      setAnnouncement(`Removed step ${index + 1}.`);
    });
    const next = remaining[index];
    (next === undefined ? addButton.current : textAreas.current[next.key])?.focus();
  };

  // Only a paste into an empty step splits, and only at blank lines; typing a blank line never does.
  const paste = (index: number, event: ClipboardEvent<HTMLTextAreaElement>) => {
    const step = steps[index];
    const paragraphs = paragraphsOf(event.clipboardData.getData('text/plain'));
    if (step === undefined || !isBlank(step.text) || paragraphs.length < 2) {
      return;
    }
    event.preventDefault();
    const pasted = paragraphs.map((text, at) => ({ key: at === 0 ? step.key : newKey(), text }));
    flushSync(() => {
      onChange((current) => current.toSpliced(index, 1, ...pasted));
      setAnnouncement(`Pasted ${pasted.length} steps.`);
    });
    const last = pasted.at(-1);
    const field = last === undefined ? undefined : textAreas.current[last.key];
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  };

  const move = (index: number, by: 1 | -1) => {
    const step = steps[index];
    const neighbour = steps[index + by];
    if (step === undefined) {
      return;
    }
    if (neighbour === undefined) {
      setAnnouncement(`Step ${index + 1} is already ${by === -1 ? 'first' : 'last'}.`);
      return;
    }
    flushSync(() => {
      onChange(steps.with(index, neighbour).with(index + by, step));
      setAnnouncement(`Moved step ${index + 1} ${by === -1 ? 'up' : 'down'}. It's now step ${index + by + 1}.`);
    });
    moveButtons.current[`${step.key}${by}`]?.focus();
  };

  const toggleReordering = () => {
    setAnnouncement('');
    onReorderingChange(!reordering);
  };

  const moveButtonRef = (key: string, by: 1 | -1) => (element: HTMLButtonElement | null) => {
    moveButtons.current[`${key}${by}`] = element;
  };

  return (
    <section aria-labelledby="recipe-form-method" className="flex flex-col gap-6">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="recipe-form-method">Method</h2>
        {steps.length >= 2 && (
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
      {reordering ? (
        <ol aria-label="Steps" className="flex flex-col divide-y divide-line">
          {steps.map((step, index) => (
            <li key={step.key} className="flex min-h-18 items-center gap-3 py-2">
              <span aria-hidden="true" className={`w-7 shrink-0 text-center ${numberClassName}`}>
                {index + 1}
              </span>
              <span className="line-clamp-2 min-w-0 grow break-words">{step.text}</span>
              <span className="flex shrink-0 gap-2">
                <IconButton
                  icon={ArrowUp}
                  label={`Move step ${index + 1} up`}
                  ref={moveButtonRef(step.key, -1)}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  icon={ArrowDown}
                  label={`Move step ${index + 1} down`}
                  ref={moveButtonRef(step.key, 1)}
                  onClick={() => move(index, 1)}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <p className="text-muted">Choose the equipment it needs, then write each step in its own box, in order.</p>
          {equipment}
          <ol aria-label="Steps" className="flex flex-col divide-y divide-line">
            {steps.map((step, index) => {
              const id = stepField(step.key);
              const error = errors[id];
              const errorId = `${id}-error`;
              return (
                <li key={step.key} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    {/* "Step 2" to a screen reader; the number alone on screen. */}
                    <label htmlFor={id} className={numberClassName}>
                      <span className="sr-only">Step</span> {index + 1}
                    </label>
                    {steps.length >= 2 && (
                      <IconButton icon={Trash2} label={`Remove step ${index + 1}`} onClick={() => remove(index)} />
                    )}
                  </div>
                  <TextArea
                    id={id}
                    ref={textAreaRef(step.key)}
                    aria-invalid={error === undefined ? undefined : true}
                    aria-describedby={error === undefined ? undefined : errorId}
                    value={step.text}
                    onChange={(event) => write(step.key, event.target.value)}
                    onPaste={(event) => paste(index, event)}
                  />
                  {error !== undefined && (
                    <p id={errorId} className="flex items-start gap-1.5 text-danger text-small">
                      <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.5} />
                      {error}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <div>
            <Button ref={addButton} variant="secondary" onClick={add}>
              <Plus aria-hidden="true" strokeWidth={2.5} />
              Add a step
            </Button>
          </div>
        </>
      )}
    </section>
  );
};
