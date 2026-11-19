import { useLingui } from '@lingui/react/macro';
import { FileLinkButton as SharedFileLinkButton } from '@ssm-usor/ui/components/file-link-button';
import type { ComponentProps } from 'react';

export function FileLinkButton(
  props: Omit<ComponentProps<typeof SharedFileLinkButton>, 'retryTitle'>
) {
  const { t } = useLingui();
  return (
    <SharedFileLinkButton
      retryTitle={t`Linkul nu s-a putut pregăti. Apasă ca să încerci din nou.`}
      {...props}
    />
  );
}
