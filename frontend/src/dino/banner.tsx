import { CircleAlert, CircleCheck, type LucideIcon, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/dino/cn';

type Tone = 'success' | 'warning' | 'danger';

const toneStyles: Record<Tone, { icon: LucideIcon; role: 'alert' | 'status'; border: string; text: string }> = {
  danger: { icon: CircleAlert, role: 'alert', border: 'border-danger', text: 'text-danger' },
  warning: { icon: TriangleAlert, role: 'status', border: 'border-warning', text: 'text-warning' },
  success: { icon: CircleCheck, role: 'status', border: 'border-success', text: 'text-success' }
};

type BannerProps = {
  tone: Tone;
  title: string;
  children?: ReactNode;
  // At most one, under the text: a Dino Button, usually secondary (docs/design.md, Components).
  action?: ReactNode;
  // In place of the tone's, where a more exact picture helps; the tone still sets its colour, border and role.
  icon?: LucideIcon;
};

export const Banner = ({ tone, title, children, action, icon }: BannerProps) => {
  const { icon: toneIcon, role, border, text } = toneStyles[tone];
  const Icon = icon ?? toneIcon;

  return (
    <div
      role={role}
      className={cn(
        'grid grid-cols-[1.375rem_minmax(0,1fr)] gap-x-3 rounded-note border-2 bg-surface py-3.5 pr-3.5 pl-4',
        border
      )}
    >
      {/* An SVG keeps its own colour under forced colours unless it's told to take its text's (CanvasText). */}
      <Icon aria-hidden="true" strokeWidth={2.5} className={cn('size-5.5 forced-colors:text-current', text)} />
      <div className="flex flex-col items-start gap-1">
        <p className="font-extrabold">{title}</p>
        {children && <div className="text-muted">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
};
