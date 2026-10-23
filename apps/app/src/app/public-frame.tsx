import { Button } from '@ssm-usor/ui/components/button';
import { PublicFrame as SharedPublicFrame } from '@ssm-usor/ui/components/public-frame';
import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink, type LinkComponent } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';

import { AuthBackdrop } from './auth-backdrop';
import { CommitVersion } from './commit-version';

export function PublicFrame({
  footerLinks,
  ...props
}: Omit<ComponentProps<typeof SharedPublicFrame>, 'footer' | 'backdrop'> & {
  footerLinks?: ReactNode;
}) {
  return (
    <SharedPublicFrame
      {...props}
      backdrop={<AuthBackdrop />}
      footer={
        <div data-public-footer className="grid justify-items-center gap-2 text-center">
          {footerLinks}
          <CommitVersion />
        </div>
      }
    />
  );
}

export function PublicFrameAction({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button className={cn('h-11 w-full', className)} {...props} />;
}

function SecondaryAnchor({ className, ...props }: ComponentProps<'a'>) {
  return (
    <a
      className={cn(
        'justify-self-center text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}

const SecondaryLink = createLink(SecondaryAnchor);

export const PublicFrameLink: LinkComponent<typeof SecondaryAnchor> = (props) => (
  <SecondaryLink {...props} />
);
