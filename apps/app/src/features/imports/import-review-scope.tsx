import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { ReviewStores, ReviewStoresContext } from './use-import-review';

export function ImportReviewScope() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [stores] = useState(() => new ReviewStores(apiRequest, queryClient));
  return (
    <ReviewStoresContext value={stores}>
      <Outlet />
    </ReviewStoresContext>
  );
}
