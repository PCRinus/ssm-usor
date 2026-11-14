import { getRouteApi } from '@tanstack/react-router';

import { BackLink } from '@/components/back-link';

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export function JobPositionBack() {
  const { clientId } = clientRoute.useParams();
  return (
    <BackLink
      to="/clienti/$clientId/posturi"
      params={{ clientId }}
      label="Înapoi la posturile de lucru"
    />
  );
}
