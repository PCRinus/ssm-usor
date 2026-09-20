import { Alert, AlertDescription, AlertTitle } from '@ssm-usor/ui/components/alert';
import { cn } from '@ssm-usor/ui/lib/utils';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

const icons = {
  info: Info,
  warning: TriangleAlert,
  success: CircleCheck,
  destructive: CircleAlert,
} as const;

type NoticeProps = Omit<ComponentProps<typeof Alert>, 'variant' | 'title'> & {
  variant: keyof typeof icons;
  title?: ReactNode;
  // A button or a link that answers the notice, kept beside the text on wide screens.
  action?: ReactNode;
};

// Every message the app shows inside a page: a failure, a warning, something to know.
// A failure interrupts a screen reader; the rest wait their turn.
export function Notice({ variant, title, action, children, className, ...props }: NoticeProps) {
  const Icon = icons[variant];
  return (
    <Alert
      variant={variant}
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(action && 'sm:pr-3', className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription
        className={cn(action && 'gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4')}
      >
        <div>{children}</div>
        {action}
      </AlertDescription>
    </Alert>
  );
}
