import { type ApiErrorResponse, employeesOverStepReason } from '@ssm-usor/contracts';

import { ApiHttpError } from '@/api/http';
import { useMe } from '@/features/account/use-me';

export function useEmployeesOverStep() {
  return useMe().data?.employeesOverStep ?? null;
}

// Until /me answers, adding shows as open: the API refuses it either way.
export function useEmployeesBlocked() {
  return useEmployeesOverStep()?.blocked === true;
}

export function isEmployeesOverStepError(error: unknown) {
  return (
    error instanceof ApiHttpError &&
    (error.body as Partial<ApiErrorResponse> | null)?.reason === employeesOverStepReason
  );
}

export const employeesOverStepMessage =
  'Nu mai poți adăuga lucrători noi: de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Treci pe o treaptă mai mare sau arhivează clienții cu care nu mai lucrezi, din Organizație, la Abonament. Tot ce ai lucrat merge mai departe.';

export const employeeImportOverStepMessage =
  'Importul aduce lucrători noi, iar de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Lasă nebifate persoanele noi ca să confirmi restul, sau treci pe o treaptă mai mare ori arhivează clienții cu care nu mai lucrezi, din Organizație, la Abonament.';

export const clientImportOverStepMessage =
  'Clientul vine cu lucrătorii lui, iar de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Ca să-l confirmi, treci pe o treaptă mai mare sau arhivează clienții cu care nu mai lucrezi, din Organizație, la Abonament. Importul rămâne de confirmat 14 zile de la ultima schimbare din el.';

export const restoreOverStepMessage =
  'Clientul are lucrători activi, iar de mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului, așa că nu îl poți reactiva acum. Treci pe o treaptă mai mare sau arhivează alți clienți cu care nu mai lucrezi, din Organizație, la Abonament.';
