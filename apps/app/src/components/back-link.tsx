import { buttonVariants } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink, type LinkComponent, useLocation, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { keepOpener, stepsBackToOpener } from '@/app/opener';

// `to` is the page above, which a new tab or a pasted link gets; a page opened from another one
// goes back to it through history instead. `up` is for a page shown inside its record's own
// layout, whose opener is the record's: its arrow always goes to `to` and leaves it to the record.
function BackAnchor({
  label,
  up = false,
  className,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'children'> & { label: string; up?: boolean }) {
  const router = useRouter();
  const opened = useLocation({ select: (location) => stepsBackToOpener(location.state) });
  const steps = up ? null : opened;
  return (
    <a
      data-testid="page-back"
      {...props}
      aria-label={steps === null ? label : 'Înapoi'}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'size-11 shrink-0 text-foreground sm:size-9',
        className
      )}
      onClick={(event) => {
        const plain =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey;
        if (steps === null || !plain) {
          onClick?.(event);
          return;
        }
        event.preventDefault();
        router.history.go(steps);
      }}
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </a>
  );
}

const BackAnchorLink = createLink(BackAnchor);

export const BackLink: LinkComponent<typeof BackAnchor> = (props) => (
  <BackAnchorLink state={keepOpener} {...props} />
);

export function TitleWithBack({
  back,
  className,
  children,
}: {
  back: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 items-start gap-1 sm:gap-1.5', className)}>
      <div className="-ml-3 flex h-9 shrink-0 items-center sm:-ml-2">{back}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
