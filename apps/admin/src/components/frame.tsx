import { PublicFrame } from '@ssm-usor/ui/components/public-frame';
import type { ComponentProps } from 'react';

export function Frame(props: Omit<ComponentProps<typeof PublicFrame>, 'footer'>) {
  return (
    <PublicFrame
      {...props}
      footer={<p className="text-muted-foreground text-sm">Platform administration</p>}
    />
  );
}
