import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  getGetServiceContractQueryKey,
  getListClientsQueryKey,
  type ServiceContractResponse,
  useGetServiceContract,
  useSaveServiceContract,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { Client } from '@/features/clients/client-form-schema';
import type { ContractFocus } from '@/features/missing-data/focus';
import { MissingDataList } from '@/features/missing-data/missing-data-list';
import {
  contractMissingGroups,
  countRows,
  missingCountLabel,
  type MissingRow,
} from '@/features/missing-data/missing-rows';
import { useStartWayBack } from '@/features/missing-data/way-back';
import { formatRoDate, todayIso } from '@/lib/dates';

import { ContractDetailsSection } from './contract-details-section';
import { ContractFileSection } from './contract-file-section';
import {
  serviceContractFormSchema,
  type ServiceContractFormValues,
  toServiceContractForm,
} from './service-contract-schema';
import { useContractFileActions } from './use-contract-file-actions';

// Rendered for owners only, as the API answers only them. `editor` is where the contract
// opens: under the lead or under the client. `readOnly` is an archived company,
// or a lead on a plan without offers.
export function ServiceContractCard({
  client,
  userId,
  readOnly,
  editor,
  focus,
}: {
  client: Client;
  userId: string;
  readOnly: boolean;
  editor: (children: ReactNode, testId: string) => ReactNode;
  focus?: ContractFocus;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryKey = [...getGetServiceContractQueryKey(client.id), userId];
  // Fetched again every time the card shows: the missing data is filled in on other pages.
  const contract = useGetServiceContract(client.id, {
    request: apiRequest,
    query: { queryKey, staleTime: 0 },
  });

  return (
    <section data-testid="service-contract-card" className="grid gap-4">
      {contract.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : contract.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={contract.isFetching}
              onClick={() => void contract.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca contractul.
        </Notice>
      ) : (
        // Keyed by what is saved, so the form starts again from what the server holds.
        <ServiceContractBody
          key={JSON.stringify([contract.data.contract, contract.data.clientRepresentative])}
          client={client}
          userId={userId}
          focus={focus}
          saved={contract.data}
          checking={contract.isFetching && !contract.isFetchedAfterMount}
          queryKey={queryKey}
          readOnly={readOnly}
          editor={editor}
        />
      )}
    </section>
  );
}

function ServiceContractBody({
  client,
  userId,
  focus,
  saved,
  checking,
  queryKey,
  readOnly,
  editor,
}: {
  client: Client;
  userId: string;
  focus: ContractFocus | undefined;
  saved: ServiceContractResponse;
  checking: boolean;
  queryKey: readonly unknown[];
  readOnly: boolean;
  editor: (children: ReactNode, testId: string) => ReactNode;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const save = useSaveServiceContract({ request: apiRequest });
  const startWayBack = useStartWayBack();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ServiceContractFormValues>({
    resolver: zodResolver(serviceContractFormSchema),
    defaultValues: toServiceContractForm(saved, todayIso()),
  });
  const formRef = useRevealErrors(form);
  const { isDirty } = form.formState;
  const { readiness } = saved;
  // The types allow a contract with neither revision, and one took the whole page down.
  const document = saved.document?.draft || saved.document?.issued ? saved.document : null;
  const missing = contractMissingGroups(readiness.missing, client);
  const here = client.stage === 'lead' ? '/oferte/$leadId' : '/clienti/$clientId/contract';
  const followMissing = (row: MissingRow) => {
    if (row.target && row.target.to !== here) {
      startWayBack({
        userId,
        clientId: client.id,
        to: client.stage === 'lead' ? 'lead-contract' : 'client-contract',
      });
    }
  };
  // The details count as saved only once they are: a suggested number is still a suggestion.
  const unsaved = isDirty || saved.contract === null;
  const title = saved.contract
    ? `Contract nr. ${saved.contract.contractNumber} din ${formatRoDate(saved.contract.contractDate)}`
    : (document?.title ?? 'Contractul');

  async function refresh(response?: ServiceContractResponse) {
    if (response) queryClient.setQueryData(queryKey, response);
    else await queryClient.invalidateQueries({ queryKey });
    // The list of leads says where each contract stands.
    await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
  }

  const fileActions = useContractFileActions({
    clientId: client.id,
    documentId: document?.id,
    title,
    refresh,
    setError,
  });
  const busy = save.isPending || fileActions.busy;

  return (
    <div className="grid gap-6">
      <ContractDetailsSection
        client={client}
        saved={saved}
        form={form}
        formRef={formRef}
        save={save}
        busy={busy}
        readOnly={readOnly}
        focus={focus}
        refresh={refresh}
        onError={setError}
      />
      <ContractFileSection
        client={client}
        saved={saved}
        document={document}
        title={title}
        readOnly={readOnly}
        busy={busy}
        unsaved={unsaved}
        checking={checking}
        error={error}
        missing={
          !readOnly &&
          !checking &&
          readiness.missing.length > 0 &&
          saved.contract !== null && (
            <div data-testid="contract-missing" className="grid gap-4">
              <Notice variant="warning" title="Contractul nu poate fi generat încă">
                {missingCountLabel(countRows(missing))}: contractul le tipărește pe toate.
              </Notice>
              <MissingDataList
                groups={missing}
                testId="contract-missing"
                onFollow={followMissing}
              />
            </div>
          )
        }
        editor={editor}
        actions={fileActions}
        refresh={refresh}
      />
    </div>
  );
}
