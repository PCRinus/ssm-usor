import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { cn } from '@ssm-usor/ui/lib/utils';
import { CircleHelp } from 'lucide-react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

import { captureHelpOpened, helpHref, helpTarget, openHelpTab } from '@/lib/help';

type HelpLinkProps = Omit<ComponentProps<'a'>, 'href' | 'target' | 'children' | 'title'> & {
  topic: HelpTopic;
} & ({ label: string; children?: undefined } | { children: ReactNode; label?: undefined });

export function HelpLink({ topic, label, children, className, onClick, ...props }: HelpLinkProps) {
  const href = helpHref(topic);
  if (!href) return null;
  return (
    <a
      href={href}
      target={helpTarget}
      aria-label={label}
      title={label}
      data-help-topic={topic}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        captureHelpOpened(topic);
        onClick?.(event);
        openHelpTab(event);
      }}
      className={cn(
        'rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        children
          ? 'font-medium text-foreground underline underline-offset-4'
          : // A 24 px target around a 16 px icon, with negative margins so it does not make the
            // label's line taller than a label without one.
            // In running text the icon's centre goes half a capital above the baseline (the box's
            // baseline is the icon's bottom edge): `middle` uses half the lowercase height and
            // leaves it visibly low beside a heading. A flex row ignores this and centres it.
            '-my-1.5 inline-flex size-6 shrink-0 items-center justify-center align-middle text-muted-foreground hover:text-foreground supports-[vertical-align:1cap]:align-[calc(0.5cap-0.5rem)]',
        className
      )}
      {...props}
    >
      {children ?? <CircleHelp aria-hidden="true" className="size-4" />}
    </a>
  );
}
