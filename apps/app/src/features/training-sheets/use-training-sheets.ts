import { useGetTrainingSheets } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useTrainingSheets(clientId: string, employeeId: string) {
  const { request } = useApi();
  return useGetTrainingSheets(clientId, employeeId, { request });
}
