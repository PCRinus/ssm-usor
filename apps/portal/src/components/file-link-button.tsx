import { useLingui } from '@lingui/react/macro';
import type { useFileLink } from '@ssm-usor/api-http/file-link';
import { Button } from '@ssm-usor/ui/components/button';
import type { ComponentProps, ReactNode } from 'react';

type Link = Pick<
  ReturnType<typeof useFileLink>,
  'href' | 'target' | 'onClick' | 'error' | 'refetch'
>;

export function FileLinkButton({
  link,
  children,
  ...props
}: ComponentProps<typeof Button> & { link: Link; children: ReactNode }) {
  const { t } = useLingui();
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
      title={
        link.error ? t`Linkul nu s-a putut pregăti. Apasă ca să încerci din nou.` : props.title
      }
      onClick={() => void link.refetch()}
    >
      {children}
    </Button>
  );
}
