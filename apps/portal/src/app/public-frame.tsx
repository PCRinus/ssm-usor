import { PublicFrame as SharedPublicFrame } from '@ssm-usor/ui/components/public-frame';
import type { ComponentProps, ReactNode } from 'react';

import { DeviceLanguageSwitch } from '@/features/language/language-switch';

import { CommitVersion } from './commit-version';

export function PublicFrame({
  languageSwitch = <DeviceLanguageSwitch />,
  ...props
}: Omit<ComponentProps<typeof SharedPublicFrame>, 'footer'> & { languageSwitch?: ReactNode }) {
  return (
    <SharedPublicFrame
      {...props}
      footer={
        <div className="flex flex-col items-center gap-4">
          {languageSwitch}
          <CommitVersion />
        </div>
      }
    />
  );
}
