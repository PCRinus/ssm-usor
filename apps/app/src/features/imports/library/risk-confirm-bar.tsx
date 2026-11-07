import type { ReactNode } from 'react';

import { Notice } from '@/components/notice';

export function RiskConfirmBar({
  summary,
  note,
  error,
  children,
}: {
  summary: string;
  note: ReactNode;
  error: string | null;
  children: ReactNode;
}) {
  return (
    // The negative margins undo the main column's padding (app-shell.tsx), so the bar spans it.
    <section
      aria-label="Confirmarea evaluărilor de risc"
      className="sticky bottom-0 z-20 -mx-5 -mb-6 grid gap-3 border-t bg-card px-5 py-3 shadow-[0_-10px_24px_-10px_rgba(24,52,46,0.18)] sm:-mx-8 sm:px-8 sm:py-4 lg:-mx-10 lg:px-10"
      data-testid="library-confirm-bar"
    >
      {error && (
        <Notice variant="destructive" data-testid="library-confirm-error">
          {error}
        </Notice>
      )}
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="grid max-w-3xl min-w-0 gap-0.5" data-testid="library-confirm-summary">
          <p className="text-sm leading-snug font-semibold sm:text-[15px]">{summary}</p>
          <p className="text-[13px] text-muted-foreground sm:text-sm">{note}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
