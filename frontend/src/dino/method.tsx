type MethodProps = { steps: { key: string | number; text: string }[] };

// The <ol> numbers each step for a screen reader, so the drawn number is hidden.
export const Method = ({ steps }: MethodProps) => (
  <ol className="flex flex-col">
    {steps.map(({ key, text }, index) => (
      <li key={key} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 border-line border-t py-4">
        <span aria-hidden="true" className="font-serif text-method-number text-pop italic lg:text-method-number-laptop">
          {index + 1}
        </span>
        <p className="max-w-[62ch] break-words lg:text-method-laptop">{text}</p>
      </li>
    ))}
  </ol>
);
