import type { ReactNode } from 'react';

import { replayMask, replayShape } from '@/app/observability/replay-masking';

interface ReplayTextProps {
  className?: string;
  children: ReactNode;
}

export function Masked({ className, children }: ReplayTextProps) {
  return (
    <span className={className} {...replayMask}>
      {children}
    </span>
  );
}

export function Shaped({ className, children }: ReplayTextProps) {
  return (
    <span className={className} {...replayShape}>
      {children}
    </span>
  );
}
