import { employeesOverStepReason } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { getGetMeQueryKey } from '@/api/generated/api';
import { apiErrorReason } from '@/api/http';
import { useMe } from '@/features/account/use-me';

export function useEmployeesOverStep() {
  return useMe().data?.employeesOverStep ?? null;
}

// Until /me answers, adding shows as open: the API refuses it either way.
export function useEmployeesBlocked() {
  return useEmployeesOverStep()?.blocked === true;
}

export function isEmployeesOverStepError(error: unknown) {
  return apiErrorReason(error) === employeesOverStepReason;
}

export const employeesOverStepMessage =
  'Nu mai poți adăuga lucrători noi: de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Treci pe o treaptă mai mare sau arhivează clienții cu care nu mai lucrezi ori trece-i la foști pe lucrătorii care nu mai lucrează la clienți, din Organizație, la Abonament. Tot ce ai lucrat merge mai departe.';

export const employeeImportOverStepMessage =
  'Importul aduce lucrători noi, iar de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Lasă deoparte persoanele noi, care nu se creează, ca să confirmi restul, sau treci pe o treaptă mai mare ori arhivează clienții cu care nu mai lucrezi ori trece-i la foști pe lucrătorii care nu mai lucrează la clienți, din Organizație, la Abonament.';

export const clientImportOverStepMessage =
  'Clientul vine cu lucrătorii lui, iar de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Ca să-l confirmi, treci pe o treaptă mai mare sau arhivează clienții cu care nu mai lucrezi ori trece-i la foști pe lucrătorii care nu mai lucrează la clienți, din Organizație, la Abonament. Importul rămâne de confirmat 14 zile de la ultima schimbare din el.';

export const restoreOverStepMessage =
  'Clientul are lucrători activi, iar de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului, așa că nu îl poți reactiva acum. Treci pe o treaptă mai mare sau arhivează alți clienți cu care nu mai lucrezi ori trece-i la foști pe lucrătorii care nu mai lucrează la clienți, din Organizație, la Abonament.';

// The count moves with every worker or client change, and the notices read it from /me.
export function refreshEmployeesOverStep(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
}
