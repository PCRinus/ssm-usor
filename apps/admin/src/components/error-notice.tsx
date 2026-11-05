import { Alert, AlertDescription } from '@ssm-usor/ui/components/alert';
import type { ReactNode } from 'react';

export function ErrorNotice({ testId, children }: { testId?: string; children: ReactNode }) {
  return (
    <Alert variant="destructive" data-testid={testId}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
