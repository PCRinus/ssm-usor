import { Alert, AlertDescription, AlertTitle } from '@ssm-usor/ui/components/alert';
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
};

export function Notice({ variant, title, children, ...props }: NoticeProps) {
  const Icon = icons[variant];
  return (
    <Alert variant={variant} role={variant === 'destructive' ? 'alert' : 'status'} {...props}>
      <Icon aria-hidden="true" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
