import type { ImportLibraryPart } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { LoaderCircle, MessageSquareWarning } from 'lucide-react';
import { useState } from 'react';

import { reportImport, reportImportLibraryPart } from '@/api/generated/api';
import { useReportProblem } from '@/app/report-problem-context';

import { importErrorMessage } from './import-format';
import { useCanReportImport } from './use-can-report-import';

export function ReportImportButton({
  importId,
  part,
  variant = 'ghost',
  className,
}: {
  importId: string;
  part?: ImportLibraryPart;
  variant?: 'ghost' | 'outline';
  className?: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const reportProblem = useReportProblem();
  const canReport = useCanReportImport();
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
    await reportProblem('Am primit semnalarea și ne uităm la import.');
    setSending(false);
  }

  if (!canReport) return null;
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
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
