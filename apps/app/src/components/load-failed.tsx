import { Button } from '@ssm-usor/ui/components/button';
import type { ReactNode } from 'react';

import { Notice } from '@/components/notice';
import { commonFailure } from '@/lib/api-errors';

export function LoadFailed({
  children,
  error,
  onRetry,
  busy,
  testId,
  retryTestId,
  size,
  className,
}: {
  children: ReactNode;
  // Given where the cause words the notice: a refusal every page words the same, such as an
  // expired session, replaces the page's own line.
  error?: unknown;
  // Left out where trying again cannot help.
  onRetry?: () => void;
  busy?: boolean;
  testId?: string;
  retryTestId?: string;
  size?: 'sm';
  className?: string;
}) {
  return (
    <Notice
      variant="destructive"
      data-testid={testId}
      className={className}
      action={
        onRetry && (
          <Button
            type="button"
            variant="outline"
            size={size}
            data-testid={retryTestId}
            disabled={busy}
            onClick={onRetry}
          >
            Încearcă din nou
          </Button>
        )
      }
    >
      {(error !== undefined && commonFailure(error)) || children}
    </Notice>
  );
}
