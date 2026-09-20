import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';

import {
  getGetClientDocumentDetailsQueryKey,
  useGetClientDocumentDetails,
} from '../api/generated/api';
import { LegalRepresentativeCard } from './legal-representative-card';
import { TrainingProgramCard } from './training-program-card';
import type { ClientSummary } from './use-document-details-form';

// One record on the server, two cards on the page: the training program is what people come
// here to check, so it stands on its own and first.
export function DocumentDetailsCards({
  client,
  userId,
}: {
  client: ClientSummary;
  userId: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetClientDocumentDetails(client.id, {
    request: apiRequest,
    query: { queryKey: [...getGetClientDocumentDetailsQueryKey(client.id), userId] },
  });

  if (details.isPending) {
    return (
      <>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </>
    );
  }
  if (details.isError) {
    return (
      <Card data-testid="document-details-unavailable">
        <CardContent
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          <p>Nu am putut încărca programul de instruire și reprezentantul legal.</p>
          <Button
            variant="outline"
            disabled={details.isFetching}
            onClick={() => void details.refetch()}
          >
            Încearcă din nou
          </Button>
        </CardContent>
      </Card>
    );
  }
  const saved = details.data.documentDetails;
  return (
    <>
      <TrainingProgramCard saved={saved} client={client} userId={userId} />
      <LegalRepresentativeCard saved={saved} client={client} userId={userId} />
    </>
  );
}
