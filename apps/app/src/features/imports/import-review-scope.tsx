import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { ChangesStores, ChangesStoresContext } from './versioned-changes-store';

export function ImportReviewScope() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [stores] = useState(() => new ChangesStores(apiRequest, queryClient));
  return (
    <ChangesStoresContext value={stores}>
      <Outlet />
    </ChangesStoresContext>
  );
}
