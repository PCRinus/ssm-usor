import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ChevronRight, FileCheck, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Notice } from '@/components/notice';

import { filesLabel } from './import-format';
import { forgetImportNotice, readImportNotice } from './import-notice';

const join = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}` : (parts[0] ?? '');

export function ImportedNotice({ clientId }: { clientId: string }) {
  // Read in the initializer and dropped in an effect: development mode calls an initializer
  // twice, and a read that also deleted would leave the second call with nothing.
  const [notice] = useState(() => readImportNotice(clientId));
  useEffect(() => forgetImportNotice(clientId), [clientId]);
  if (!notice) return null;
  const files =
    notice.files === 0
      ? ''
      : notice.files === 1
        ? ' Fișierul e în Alte documente, ca dosarul importat.'
        : ` Cele ${filesLabel(notice.files)} sunt în Alte documente, grupate ca dosarul importat.`;
  return (
    <div className="grid gap-4" data-testid="client-imported">
      <Notice
        variant="success"
        data-testid="client-imported-notice"
        action={
          notice.files > 0 && (
            <Button asChild variant="outline" size="sm" className="bg-card">
              <Link to="/clients/$clientId/other-documents" params={{ clientId }}>
                {notice.existing ? 'Vezi dosarul importat' : 'Vezi fișierele'}
              </Link>
            </Button>
          )
        }
      >
        <strong className="font-semibold">
          {notice.existing
            ? 'Clientul a fost completat din documente.'
            : 'Clientul a fost creat din documente.'}
        </strong>
        {notice.existing && notice.added.length > 0 && ` Am adăugat ${join(notice.added)}.`}
        {notice.existing && notice.changed.length > 0 && ` ${join(notice.changed)}.`}
        {files}
      </Notice>
      <section aria-labelledby="client-imported-next" className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="client-imported-next" className="text-base font-semibold">
            Generează documentația nouă
          </h2>
          <span className="text-sm text-muted-foreground">
            Vechile documente rămân doar ca istoric
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                '/clients/$clientId/documents',
                'Documentația SSM',
                'După ce completezi posturile de lucru',
                FileCheck,
              ],
              [
                '/clients/$clientId/fire-safety-documents',
                'Documentația PSI',
                'După ce completezi mijloacele PSI și echipa',
                FileText,
              ],
            ] as const
          ).map(([to, title, hint, Icon]) => (
            <Link
              key={to}
              to={to}
              params={{ clientId }}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <span
                className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </span>
              <span className="grid">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{hint}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
