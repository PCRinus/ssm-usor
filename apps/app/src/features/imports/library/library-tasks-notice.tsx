import type { ImportLibraryPart } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Link, useRouteContext } from '@tanstack/react-router';
import { BookOpenCheck } from 'lucide-react';
import { useState } from 'react';

import { getListImportsQueryKey, useListImports } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';

import {
  isOpenPart,
  joinNames,
  libraryDay,
  partLabels,
  partOrder,
  partsNoun,
  statusLabels,
} from './library-model';

const order: readonly ImportLibraryPart[] = [...partOrder, 'risk_evaluations'];

const labelOf = (part: ImportLibraryPart) =>
  part === 'risk_evaluations' ? 'Evaluări de risc' : partLabels[part];

export function LibraryTasksNotice({ clientId }: { clientId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const params = { clientId, kind: 'client' as const, status: 'confirmed' as const };
  const confirmed = useListImports(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListImportsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const [now] = useState(() => Date.now());
  const imports = (confirmed.data?.items ?? []).flatMap((item) => {
    const open = item.libraryParts
      .filter((part) => isOpenPart(part, now))
      .sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));
    return open.length > 0 ? [{ item, open }] : [];
  });
  if (imports.length === 0) return null;
  return (
    <div className="grid gap-3" data-testid="client-library-tasks">
      {imports.map(({ item, open }) => {
        const until = open[0]!.expiresAt;
        const noun = partsNoun(open)!;
        const onlyRisks = open.every((part) => part.part === 'risk_evaluations');
        const onlyInstructions = open.every((part) => part.part !== 'risk_evaluations');
        return (
          <Notice
            key={item.id}
            variant="info"
            icon={<BookOpenCheck aria-hidden="true" />}
            title={`${noun} din documentația importată`}
            data-testid="client-library-tasks-notice"
            action={
              <Button asChild variant="outline" size="sm" className="bg-card">
                <Link
                  to="/clienti/import/$importId"
                  params={{ importId: item.id }}
                  data-testid="client-library-tasks-open"
                >
                  {onlyInstructions
                    ? 'Verifică instrucțiunile'
                    : onlyRisks
                      ? 'Verifică evaluările'
                      : 'Verifică importul'}
                </Link>
              </Button>
            }
          >
            {joinNames(
              open.map(
                (part) => `${labelOf(part.part)}: ${statusLabels[part.status].toLowerCase()}`
              )
            )}
            . Le adaugi în biblioteca ta și la posturile clientului
            {until ? ` până pe ${libraryDay(until)}` : ''}.
          </Notice>
        );
      })}
    </div>
  );
}
