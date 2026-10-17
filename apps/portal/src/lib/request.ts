import { useRouteContext } from '@tanstack/react-router';

export function useApiRequest() {
  return useRouteContext({ from: '__root__' }).apiRequest;
}
