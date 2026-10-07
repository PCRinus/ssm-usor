import { useRouteContext } from '@tanstack/react-router';

import {
  getListLegalActsQueryKey,
  getListLegalChangesQueryKey,
  useListLegalActs,
  useListLegalChanges,
} from '@/api/generated/api';

import { DocumentsBehind } from './documents-behind';
import { LastCheck } from './last-check';
import { LegalChanges } from './legal-changes';
import { WatchedActs } from './watched-acts';

export function LegislationPage({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const acts = useListLegalActs({
    request: apiRequest,
    query: { queryKey: [...getListLegalActsQueryKey(), userId] },
  });
  const changes = useListLegalChanges({
    request: apiRequest,
    query: { queryKey: [...getListLegalChangesQueryKey(), userId] },
  });
  const actNames = new Map((acts.data?.items ?? []).map((act) => [act.id, act.name]));

  return (
    <div data-testid="legislation-page" className="grid gap-10">
      <div className="grid gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Legislație</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Actele normative pe care le citează documentele, modificările lor și documentele care
            trebuie generate din nou după ce un șablon se schimbă.
          </p>
        </div>
        <LastCheck userId={userId} actNames={actNames} />
      </div>
      <DocumentsBehind userId={userId} />
      <LegalChanges changes={changes} />
      <WatchedActs acts={acts} />
    </div>
  );
}
