import { Button } from '@ssm-usor/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { BackLink } from '@/components/back-link';

import { ImportLoader } from '../import-loader';
import { ChangesStores, ChangesStoresContext } from '../versioned-changes-store';
import { EmployeeHub } from './employee-hub';
import { EmployeeProcessing } from './employee-processing';
import { EmployeePersonPage } from './person-page';

export function EmployeeImportScope() {
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [stores] = useState(() => new ChangesStores(request, queryClient));
  return (
    <ChangesStoresContext value={stores}>
      <Outlet />
    </ChangesStoresContext>
  );
}

const belongsTo = (detail: ImportDetail, clientId: string) =>
  detail.kind === 'employees' && detail.client?.id === clientId;

function EmployeeImportNotFound({ clientId }: { clientId: string }) {
  return (
    <div data-testid="employee-import-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Importul nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun import de lucrători cu acest identificator la acest client.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clienti/$clientId/angajati" params={{ clientId }}>
          Înapoi la lucrători
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
    <ImportLoader
      importId={importId}
      back={
        <BackLink
          to="/clienti/$clientId/angajati"
          params={{ clientId }}
          label="Înapoi la lucrători"
        />
      }
    >
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
    <ImportLoader
      importId={importId}
      back={
        <BackLink
          to="/clienti/$clientId/angajati/import/$importId"
          params={{ clientId, importId }}
          label="Înapoi la import"
        />
      }
    >
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
