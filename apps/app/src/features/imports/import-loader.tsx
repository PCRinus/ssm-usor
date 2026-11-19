import { Button } from '@ssm-usor/ui/components/button';
import type { ReactNode } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { TitleWithBack } from '@/components/back-link';
import { Notice } from '@/components/notice';

import { importErrorMessage } from './import-format';
import { useImport } from './use-import';

export function ImportLoader({
  importId,
  back,
  children,
}: {
  importId: string;
  back: ReactNode;
  children: (detail: ImportDetail) => ReactNode;
}) {
  const query = useImport(importId);
  if (query.isPending) {
    return (
      <div className="grid gap-4" data-testid="import-loading" aria-busy="true">
        <TitleWithBack back={back}>
          <div className="h-9 w-64 max-w-full animate-pulse rounded-md bg-muted" />
        </TitleWithBack>
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="grid justify-items-start gap-4">
        <div className="flex">{back}</div>
        <Notice
          variant="destructive"
          data-testid="import-error"
          className="w-full"
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Încearcă din nou
            </Button>
          }
        >
          {importErrorMessage(query.error, 'Nu am putut încărca importul. Încearcă din nou.')}
        </Notice>
      </div>
    );
  }
  return children(query.data.import);
}
