import type { DocumentSet } from '@ssm-usor/contracts';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';

import { documentSetCopy } from './document-sets';
import { archivedHint, packTotalLabel } from './pack-labels';
import type { Pack } from './pack-status';

export function PackEmpty({
  set,
  pack,
  readOnly,
  action,
}: {
  set: DocumentSet;
  pack: Pack;
  readOnly: boolean;
  action?: ReactNode;
}) {
  const copy = documentSetCopy[set];
  return (
    <div data-testid="documents-empty" className="px-4 pt-4 pb-5 sm:px-6 sm:pt-6 sm:pb-5">
      <div
        data-testid="pack-empty-panel"
        className="grid gap-3.5 rounded-xl bg-success p-5 sm:justify-items-start sm:gap-4 sm:p-8"
      >
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-[11px] bg-brand-lime sm:size-13 sm:rounded-xl"
        >
          <FileText className="size-5.5 sm:size-6" />
        </span>
        <div className="grid max-w-[68ch] gap-1.5">
          <h2 className="text-lg leading-snug font-semibold tracking-tight sm:text-xl">
            Documentația {copy.name} nu este generată încă
          </h2>
          <p data-testid="documents-hint" className="text-success-foreground">
            {readOnly
              ? archivedHint
              : `${copy.emptyHint} Dosarele de mai jos arată ce va cuprinde: ${packTotalLabel(pack)}.`}
          </p>
        </div>
        {!readOnly && action}
      </div>
    </div>
  );
}
