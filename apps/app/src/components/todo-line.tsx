import { cn } from '@ssm-usor/ui/lib/utils';
import { TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export function TodoLine({
  action,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { action?: ReactNode }) {
  return (
    <div
      role="status"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-5', className)}
      {...props}
    >
      <p className="flex min-w-0 flex-[1_1_20rem] items-start gap-2 font-medium text-warning-foreground">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{children}</span>
      </p>
      {action}
    </div>
  );
}
