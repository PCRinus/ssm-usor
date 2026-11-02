import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { LibraryReviewStores, LibraryReviewStoresContext } from './library/use-library-parts';
import { ReviewStores, ReviewStoresContext } from './use-import-review';

export function ImportReviewScope() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [stores] = useState(() => new ReviewStores(apiRequest, queryClient));
  const [libraryStores] = useState(() => new LibraryReviewStores(apiRequest, queryClient));
  return (
    <ReviewStoresContext value={stores}>
      <LibraryReviewStoresContext value={libraryStores}>
        <Outlet />
      </LibraryReviewStoresContext>
    </ReviewStoresContext>
  );
}
