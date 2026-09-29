import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Sonner's own stylesheet is unlayered and more specific than a utility, so the buttons'
// colors need `!` to win.
const actionButton = [
  '!h-8 !rounded-md !px-3 !text-sm !font-medium !bg-primary !text-primary-foreground',
  'in-data-[type=success]:!bg-success-foreground in-data-[type=success]:!text-success',
  'in-data-[type=info]:!bg-info-foreground in-data-[type=info]:!text-info',
  'in-data-[type=warning]:!bg-warning-foreground in-data-[type=warning]:!text-warning',
  'in-data-[type=error]:!bg-destructive-foreground in-data-[type=error]:!text-destructive-soft',
].join(' ');

const cancelButton =
  '!h-8 !rounded-md !border !border-current/30 !bg-transparent !px-3 !text-sm !font-medium !text-current';

// shadcn's version reads the theme from next-themes; the app has a single light theme. The
// variants use the tokens of the Notice variants, so a toast and a notice of one kind match.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{ classNames: { actionButton, cancelButton } }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--success)',
          '--success-border': 'var(--success-border)',
          '--success-text': 'var(--success-foreground)',
          '--info-bg': 'var(--info)',
          '--info-border': 'var(--info-border)',
          '--info-text': 'var(--info-foreground)',
          '--warning-bg': 'var(--warning)',
          '--warning-border': 'var(--warning-border)',
          '--warning-text': 'var(--warning-foreground)',
          '--error-bg': 'var(--destructive-soft)',
          '--error-border': 'var(--destructive-border)',
          '--error-text': 'var(--destructive-foreground)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
