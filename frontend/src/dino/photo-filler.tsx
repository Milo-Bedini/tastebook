import type { ComponentType } from 'react';
import { useId } from 'react';

import { cn } from '@/dino/cn';

type Shape = 'card' | 'hero';
type Filler = 'place-setting' | 'rug';

const shapeStyles: Record<Shape, string> = {
  card: 'aspect-4/3',
  hero: 'aspect-7/5'
};

// Recipe IDs are sequential, so neighbours in the catalogue tend to differ.
const fillerFor = (recipeId: number): Filler => (recipeId % 2 === 0 ? 'place-setting' : 'rug');

type FillerProps = { shape: Shape };

export const PlaceSetting = ({ shape }: FillerProps) => (
  <div
    aria-hidden="true"
    data-filler="place-setting"
    className={cn(
      'grid w-full place-items-center border-2 border-on-pastel/28 border-dashed bg-paper',
      shapeStyles[shape]
    )}
  >
    <svg
      viewBox="0 0 96 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-auto w-[58%]"
    >
      <circle cx="48" cy="34" r="22" />
      <circle cx="48" cy="34" r="14" strokeOpacity="0.45" />
      <path d="M14 12v12a5 5 0 0 0 10 0V12M19 12v44M80 12c-5 3-6 12-6 18h6v26" />
    </svg>
  </div>
);

// The plate's shadow is drawn, not a CSS shadow: only polaroids, the dock and sheets carry one.
const Rug = ({ shape }: FillerProps) => {
  const patternId = useId();
  return (
    <svg
      viewBox="0 0 140 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      data-filler="rug"
      className={cn('block w-full', shapeStyles[shape])}
    >
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width="16" height="16">
          <rect x="0" y="0" width="8" height="16" fill="currentColor" fillOpacity="0.13" />
          <rect x="0" y="0" width="16" height="8" fill="currentColor" fillOpacity="0.13" />
        </pattern>
      </defs>
      <rect width="140" height="100" fill="var(--color-paper)" />
      <rect width="140" height="100" fill={`url(#${patternId})`} />
      <circle cx="70" cy="52" r="21" fill="currentColor" fillOpacity="0.15" />
      <circle cx="70" cy="50" r="20" fill="var(--color-paper)" />
      <circle cx="70" cy="50" r="14" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="2" />
    </svg>
  );
};

const fillers: Record<Filler, ComponentType<FillerProps>> = {
  'place-setting': PlaceSetting,
  rug: Rug
};

export const PhotoFiller = ({ recipeId, shape }: { recipeId: number; shape: Shape }) => {
  const Drawing = fillers[fillerFor(recipeId)];
  return <Drawing shape={shape} />;
};
