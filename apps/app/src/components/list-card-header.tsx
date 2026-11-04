import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink, type LinkComponent } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';

export function ListCardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 border-b px-5 py-3', className)}
      {...props}
    />
  );
}

export function FilterTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex gap-1">
      {children}
    </nav>
  );
}

function FilterTabAnchor({
  active,
  className,
  ...props
}: ComponentProps<'a'> & { active: boolean }) {
  return (
    <a
      {...props}
      // After the spread: the router matches search loosely and would mark the tab without
      // search params current on every other tab too.
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
        className
      )}
    />
  );
}

const FilterTabLink = createLink(FilterTabAnchor);

export const FilterTab: LinkComponent<typeof FilterTabAnchor> = (props) => (
  <FilterTabLink {...props} />
);

export function ListCount({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <span className="ml-auto text-sm text-muted-foreground" data-testid={testId}>
      {children}
    </span>
  );
}
