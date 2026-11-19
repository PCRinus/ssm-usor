import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { useApi } from '@/api/use-api';

import { ChangesStores, ChangesStoresContext } from './versioned-changes-store';

export function ImportReviewScope() {
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [stores] = useState(() => new ChangesStores(request, queryClient));
  return (
    <ChangesStoresContext value={stores}>
      <Outlet />
    </ChangesStoresContext>
  );
}
