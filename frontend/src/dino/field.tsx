import { CircleAlert } from 'lucide-react';
import { type ReactNode, useId } from 'react';

export type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

type FieldProps = {
  label: string;
  help?: string;
  error?: string;
  // For a field whose purpose shows without it, like search: the label still names the control.
  hideLabel?: boolean;
  children: (control: FieldControlProps, label: { labelId: string }) => ReactNode;
};

type FieldTextProps = { id: string; children: string };

const FieldHelp = ({ id, children }: FieldTextProps) => (
  <p id={id} className="text-small text-muted">
    {children}
  </p>
);

const FieldError = ({ id, children }: FieldTextProps) => (
  <p id={id} className="flex items-start gap-1.5 text-danger text-small">
    <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.5} />
    {children}
  </p>
);

export const FieldDescription = ({ id, help, error }: { id: string; help?: string; error?: string }) => {
  if (error) {
    return <FieldError id={id}>{error}</FieldError>;
  }
  if (help) {
    return <FieldHelp id={id}>{help}</FieldHelp>;
  }
  return null;
};

export const Field = ({ label, help, error, hideLabel = false, children }: FieldProps) => {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <div className="flex flex-col gap-1.5">
      <label id={labelId} htmlFor={id} className={hideLabel ? 'sr-only' : 'text-label'}>
        {label}
      </label>
      {children(
        {
          id,
          'aria-describedby': error || help ? descriptionId : undefined,
          'aria-invalid': error ? true : undefined
        },
        { labelId }
      )}
      <FieldDescription id={descriptionId} help={help} error={error} />
    </div>
  );
};
