import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink, type LinkComponent, useLocation, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { keepOpener, stepsBackToOpener } from '@/app/opener';

// The router marks a link to an ancestor of the current page as active; the way up is never the
// current page, so neither mark is passed on.
// `to` is the page above, which a new tab or a pasted link gets; a page opened from another one
// goes back to it through history instead.
function BackAnchor({
  label,
  className,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'children'> & { label: string }) {
  const router = useRouter();
  const steps = useLocation({ select: (location) => stepsBackToOpener(location.state) });
  return (
    <a
      data-testid="page-back"
      {...props}
      aria-current={undefined}
      data-status={undefined}
      aria-label={steps === null ? label : 'Înapoi'}
      className={cn(
        // Brand colours, not the theme's primary and ring: the document editor redefines those
        // inside its title bar, where this arrow also sits.
        'inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-forest/10 text-brand-forest transition-colors outline-none hover:bg-brand-forest/20 focus-visible:ring-[3px] focus-visible:ring-brand-forest/40 active:bg-brand-forest/25 sm:size-9',
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
      <ArrowLeft className="size-5 sm:size-4" aria-hidden="true" />
    </a>
  );
}

const BackAnchorLink = createLink(BackAnchor);

export const BackLink: LinkComponent<typeof BackAnchor> = (props) => (
  <BackAnchorLink state={keepOpener} {...props} />
);

export function TitleWithBack({
  back,
  eyebrow,
  className,
  children,
}: {
  back: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-1 gap-y-1 sm:gap-x-1.5',
        className
      )}
    >
      {eyebrow && <div className="col-start-2 min-w-0">{eyebrow}</div>}
      <div className="flex h-9 items-center self-start">{back}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
