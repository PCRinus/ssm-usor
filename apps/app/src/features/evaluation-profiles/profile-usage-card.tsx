import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';

import {
  type EvaluationProfileUsageResponseItemsItem,
  getGetEvaluationProfileUsageQueryKey,
  useGetEvaluationProfileUsage,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { EvaluationLink } from '@/features/risk-evaluations/evaluation-link';
import {
  evaluationCountLabel,
  evaluationTitle,
  factorCountLabel,
} from '@/features/risk-evaluations/risk-evaluation-schema';

type ProfileUse = EvaluationProfileUsageResponseItemsItem;

interface ClientUses {
  clientId: string;
  clientName: string;
  archived: boolean;
  uses: ProfileUse[];
}

function byClient(items: readonly ProfileUse[]): ClientUses[] {
  const clients: ClientUses[] = [];
  for (const item of items) {
    const last = clients.at(-1);
    if (last?.clientId === item.clientId) {
      last.uses.push(item);
      continue;
    }
    clients.push({
      clientId: item.clientId,
      clientName: item.clientName,
      archived: item.clientArchivedAt !== null,
      uses: [item],
    });
  }
  return clients;
}

export function ProfileUsageCard({ profileId, userId }: { profileId: string; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const usage = useGetEvaluationProfileUsage(profileId, {
    request: apiRequest,
    query: { queryKey: [...getGetEvaluationProfileUsageQueryKey(profileId), userId] },
  });
  const items = usage.data?.items ?? [];

  return (
    <SectionCard
      id="usage"
      headingLevel={3}
      data-testid="risk-profile-usage"
      title={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          Unde este folosit
          {usage.isSuccess && items.length > 0 && (
            <span
              data-testid="risk-profile-usage-count"
              className="text-sm font-normal text-muted-foreground"
            >
              {evaluationCountLabel(items.length)}
            </span>
          )}
        </span>
      }
    >
      {usage.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : usage.isError ? (
        <Notice
          variant="destructive"
          data-testid="risk-profile-usage-error"
          action={
            <Button
              variant="outline"
              disabled={usage.isFetching}
              onClick={() => void usage.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca evaluările care folosesc profilul.
        </Notice>
      ) : items.length === 0 ? (
        <p data-testid="risk-profile-usage-empty" className="text-sm text-muted-foreground">
          Profilul nu este folosit încă la niciun client. Deschide evaluarea unui post și alege
          „Aplică un profil”.
        </p>
      ) : (
        <ul className="grid divide-y">
          {byClient(items).map((client) => (
            <li
              key={client.clientId}
              data-testid="risk-profile-usage-client"
              className="grid gap-1.5 py-3 text-sm first:pt-0 last:pb-0"
            >
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 font-medium wrap-anywhere">{client.clientName}</span>
                {client.archived && (
                  <span
                    data-testid="risk-profile-usage-archived"
                    className="text-[0.8125rem] text-muted-foreground"
                  >
                    (arhivat)
                  </span>
                )}
              </p>
              <ul className="grid gap-1">
                {client.uses.map((use) => (
                  <li
                    key={use.id}
                    data-testid="risk-profile-usage-row"
                    className="flex flex-wrap items-baseline justify-between gap-x-4"
                  >
                    <EvaluationLink
                      evaluation={use}
                      data-testid="risk-profile-usage-open"
                      className="min-w-0 rounded-sm underline decoration-muted-foreground/45 underline-offset-3 outline-none wrap-anywhere hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {evaluationTitle(use)}
                    </EvaluationLink>
                    <span
                      data-testid="risk-profile-usage-factors"
                      className="text-muted-foreground tabular-nums"
                    >
                      {factorCountLabel(use.linkedFactorCount)} din profil
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
