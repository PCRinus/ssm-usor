import { cn } from '@ssm-usor/ui/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  actions,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { icon: LucideIcon; actions?: ReactNode }) {
  return (
    <div className={cn('grid justify-items-center py-2 text-center', className)} {...props}>
      <Icon className="mb-4 size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p>
      {actions && (
        <div className="mt-5 grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
          {actions}
        </div>
      )}
    </div>
  );
}
