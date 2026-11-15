import { Button } from '@ssm-usor/ui/components/button';
import { SearchX } from 'lucide-react';

import { ApiHttpError } from '@/api/http';
import { EmptyState } from '@/components/empty-state';

import { workerNoun } from './employee-format';

export function WorkersCount({
  total,
  unfilteredTotal,
  narrowed,
  short,
}: {
  total: number;
  unfilteredTotal: number;
  narrowed: boolean;
  short: boolean;
}) {
  if (!narrowed) return workerNoun(total);
  return (
    <>
      <b className="font-semibold text-foreground">{total}</b> din{' '}
      {short ? unfilteredTotal : workerNoun(unfilteredTotal)}
    </>
  );
}

export function WorkersNoMatch({
  former,
  filtered,
  q,
  testId,
  onClear,
}: {
  former: boolean;
  filtered: boolean;
  q: string | undefined;
  testId: string;
  onClear: () => void;
}) {
  const who = former ? 'Niciun fost lucrător' : 'Niciun lucrător actual';
  return (
    <EmptyState
      icon={SearchX}
      title="Niciun lucrător nu se potrivește"
      data-testid={testId}
      actions={
        <Button variant="outline" data-testid={`${testId}-clear`} onClick={onClear}>
          {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
        </Button>
      }
    >
      {filtered
        ? `${who} nu se potrivește filtrelor alese${q ? ' și căutării' : ''}. Scoate unul dintre filtrele de mai sus sau pornește din nou de la toți lucrătorii.`
        : `${who} nu se potrivește căutării „${q}”. Caută după nume sau marcă.`}
    </EmptyState>
  );
}

export function WorkersListError({
  error,
  testId,
  notFound,
  onRetry,
  retrying,
}: {
  error: unknown;
  testId: string;
  // What a 404 means on this list; without it, the general message.
  notFound?: string;
  // Left out without an API to try again.
  onRetry?: () => void;
  retrying: boolean;
}) {
  const status = error instanceof ApiHttpError ? error.status : undefined;
  return (
    <>
      <p data-testid={`${testId}-error`} role="alert" className="text-sm">
        {status === 401
          ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
          : status === 403
            ? 'Contul tău nu face parte dintr-o organizație. Contactează adminul.'
            : status === 404 && notFound
              ? notFound
              : 'Nu am putut încărca lista lucrătorilor. Încearcă din nou.'}
      </p>
      {onRetry && (
        <Button
          data-testid={`${testId}-retry`}
          variant="outline"
          className="mt-4"
          disabled={retrying}
          onClick={onRetry}
        >
          Încearcă din nou
        </Button>
      )}
    </>
  );
}
