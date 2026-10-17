import { PublicFrame as SharedPublicFrame } from '@ssm-usor/ui/components/public-frame';
import type { ComponentProps } from 'react';

import { CommitVersion } from './commit-version';

export function PublicFrame(props: Omit<ComponentProps<typeof SharedPublicFrame>, 'footer'>) {
  return <SharedPublicFrame {...props} footer={<CommitVersion />} />;
}
