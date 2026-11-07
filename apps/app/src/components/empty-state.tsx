import { cn } from '@ssm-usor/ui/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  actions,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { icon: LucideIcon; title?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={cn('grid justify-items-center py-2 text-center', className)} {...props}>
      <Icon className="mb-4 size-8 text-muted-foreground" aria-hidden="true" />
      {title && <h3 className="text-base font-medium">{title}</h3>}
      <p className={cn('max-w-md text-sm leading-relaxed text-muted-foreground', title && 'mt-2')}>
        {children}
      </p>
      {actions && (
        <div className="mt-5 grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
          {actions}
        </div>
      )}
    </div>
  );
}

export function ListEmpty({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-12', className)} {...props} />;
}
