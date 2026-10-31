import { Button } from '@ssm-usor/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';

import { ImportLoader } from '../import-processing-page';
import { EmployeeHub } from './employee-hub';
import { EmployeeProcessing } from './employee-processing';
import { EmployeePersonPage } from './person-page';
import { EmployeeReviewStores, EmployeeReviewStoresContext } from './use-employee-review';

export function EmployeeImportScope() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [stores] = useState(() => new EmployeeReviewStores(apiRequest, queryClient));
  return (
    <EmployeeReviewStoresContext value={stores}>
      <Outlet />
    </EmployeeReviewStoresContext>
  );
}

const belongsTo = (detail: ImportDetail, clientId: string) =>
  detail.kind === 'employees' && detail.client?.id === clientId;

function EmployeeImportNotFound({ clientId }: { clientId: string }) {
  return (
    <div data-testid="employee-import-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Importul nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun import de angajați cu acest identificator la acest client.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients/$clientId/employees" params={{ clientId }}>
          Înapoi la angajați
        </Link>
      </Button>
    </div>
  );
}

export function EmployeeImportPage({
  importId,
  clientId,
  clientName,
}: {
  importId: string;
  clientId: string;
  clientName: string;
}) {
  return (
    <ImportLoader importId={importId}>
      {(detail) =>
        !belongsTo(detail, clientId) ? (
          <EmployeeImportNotFound clientId={clientId} />
        ) : detail.status === 'ready' && detail.employees ? (
          <EmployeeHub
            key={detail.id}
            detail={detail}
            clientId={clientId}
            clientName={clientName}
          />
        ) : (
          <EmployeeProcessing detail={detail} clientId={clientId} />
        )
      }
    </ImportLoader>
  );
}

export function EmployeeImportPersonPage({
  importId,
  clientId,
  personId,
}: {
  importId: string;
  clientId: string;
  personId: string;
}) {
  return (
    <ImportLoader importId={importId}>
      {(detail) =>
        !belongsTo(detail, clientId) ? (
          <EmployeeImportNotFound clientId={clientId} />
        ) : detail.status === 'ready' && detail.employees ? (
          <EmployeePersonPage
            key={personId}
            detail={detail}
            clientId={clientId}
            personId={personId}
          />
        ) : (
          <EmployeeProcessing detail={detail} clientId={clientId} />
        )
      }
    </ImportLoader>
  );
}
