import { cn } from '@ssm-usor/ui/lib/utils';

import type { ReleaseKind } from './release-format';

const squares: Record<ReleaseKind, string> = {
  features: 'bg-brand-lime shadow-[0_0_0_1px_var(--release-new-edge)]',
  improvements: 'bg-info-border',
  fixes: 'bg-warning-border',
};

export function KindSquare({ kind, className }: { kind: ReleaseKind; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('size-2.5 rounded-[3px]', squares[kind], className)} />
  );
}
