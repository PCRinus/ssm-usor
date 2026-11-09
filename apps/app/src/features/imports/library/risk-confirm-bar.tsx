import type { ReactNode } from 'react';

import { ImportActionBar, type ImportSaveState } from '../import-action-bar';

export function RiskConfirmBar({
  summary,
  note,
  details,
  save,
  error,
  children,
}: {
  summary: ReactNode;
  note?: ReactNode;
  details?: ReactNode;
  save?: ImportSaveState;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <ImportActionBar
      label="Confirmarea evaluărilor de risc"
      testId="library-confirm-bar"
      summary={<div data-testid="library-confirm-summary">{summary}</div>}
      note={note}
      details={details}
      save={save}
      error={error}
    >
      {children}
    </ImportActionBar>
  );
}
