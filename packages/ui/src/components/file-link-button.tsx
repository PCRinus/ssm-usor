import { Button } from '@ssm-usor/ui/components/button';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

// Structural, so ui needs no dependency on @ssm-usor/api-http, whose useFileLink returns it.
export interface FileLinkState {
  href: string | undefined;
  target: string | undefined;
  onClick(event: MouseEvent<HTMLAnchorElement>): unknown;
  error: unknown;
  refetch(): unknown;
}

export function FileLinkButton({
  link,
  retryTitle,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  link: FileLinkState;
  retryTitle: string;
  children: ReactNode;
}) {
  if (link.href) {
    return (
      <Button asChild {...props}>
        <a href={link.href} target={link.target} onClick={(event) => void link.onClick(event)}>
          {children}
        </a>
      </Button>
    );
  }
  return (
    <Button
      {...props}
      disabled={props.disabled || !link.error}
      title={link.error ? retryTitle : props.title}
      onClick={() => void link.refetch()}
    >
      {children}
    </Button>
  );
}
