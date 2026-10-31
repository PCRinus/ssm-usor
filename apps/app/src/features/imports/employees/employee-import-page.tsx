import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

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
        detail.status === 'ready' && detail.employees ? (
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
        detail.status === 'ready' && detail.employees ? (
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
