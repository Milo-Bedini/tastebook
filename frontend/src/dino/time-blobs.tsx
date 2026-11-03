import { cn } from '@/dino/cn';

type TimeBlob = { label: string; value: string };

// A recipe shows only the times it has, so one to three.
type TimeBlobsProps = { times: [TimeBlob] | [TimeBlob, TimeBlob] | [TimeBlob, TimeBlob, TimeBlob] };

// Peach, butter and mint by position, whatever time each holds, each with its own fixed shape (docs/design.md, Blobs),
// so there are at most three. The grid keeps three columns, so a lone blob is the first of three, never stretched.
const blobStyles = ['bg-peach rounded-blob-1', 'bg-butter rounded-blob-2', 'bg-mint rounded-blob-3'] as const;

// The transparent border is what forced colours outlines. The label comes first for a screen reader, the value on top.
export const TimeBlobs = ({ times }: TimeBlobsProps) => (
  <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-[repeat(3,9.375rem)] large-text:grid-cols-1">
    {times.map(({ label, value }, index) => (
      <div
        key={label}
        className={cn(
          'flex flex-col-reverse items-center border-2 border-transparent px-2 py-3 text-center text-on-pastel',
          blobStyles[index]
        )}
      >
        <dt className="text-small">{label}</dt>
        <dd className="break-words font-serif text-title">{value}</dd>
      </div>
    ))}
  </dl>
);
