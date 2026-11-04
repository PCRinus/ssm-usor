import type { ImportLibraryPart } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { LoaderCircle, MessageSquareWarning } from 'lucide-react';
import { useState } from 'react';

import { reportImport, reportImportLibraryPart } from '@/api/generated/api';
import { useOpenSupport } from '@/app/observability/open-support';

import { importErrorMessage } from './import-format';

export function ReportImportButton({
  importId,
  part,
}: {
  importId: string;
  part?: ImportLibraryPart;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const openSupport = useOpenSupport();
  const [sending, setSending] = useState(false);

  async function report() {
    setSending(true);
    try {
      await (part
        ? reportImportLibraryPart(importId, part, apiRequest)
        : reportImport(importId, apiRequest));
    } catch (cause) {
      setSending(false);
      toast.error(importErrorMessage(cause, 'Nu am putut trimite semnalarea. Încearcă din nou.'));
      return;
    }
    const opened = await openSupport();
    setSending(false);
    if (!opened) toast.success('Am primit semnalarea. Ne uităm la import.');
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="import-report"
      disabled={sending}
      onClick={() => void report()}
    >
      {sending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <MessageSquareWarning aria-hidden="true" />
      )}
      Raportează o problemă cu importul
    </Button>
  );
}
