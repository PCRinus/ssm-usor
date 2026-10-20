import { testErrorReasons } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

import {
  type ApiErrorResponse,
  getGetEmployeeQueryKey,
  getGetEmployeeTestsQueryKey,
  getGetTestBankQueryKey,
  getListEmployeesQueryKey,
  getListOrganizationEmployeesQueryKey,
  type TestBankResponse,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { roCount } from '@/features/employees/employee-format';

export type BankTest = TestBankResponse['tests'][number];
export type BankQuestion = BankTest['questions'][number];

export const belowMinimumMessage = 'Un test trebuie să păstreze cel puțin zece întrebări active.';

export function bankTestFacts(
  test: Pick<BankTest, 'activeCount'>,
  bank: Pick<TestBankResponse, 'sittingSize' | 'passMarkPercent'>
) {
  const active =
    test.activeCount === 0
      ? 'Nicio întrebare activă'
      : roCount(test.activeCount, 'întrebare activă', 'întrebări active');
  return `${active} · se extrag ${bank.sittingSize} · prag ${bank.passMarkPercent} %`;
}

export const optionLetter = (index: number) => String.fromCharCode(97 + index);

export function testFailure(cause: unknown, fallback: string) {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  switch (body?.reason) {
    case testErrorReasons.belowMinimum:
      return belowMinimumMessage;
    case testErrorReasons.builtIn:
      return 'O întrebare predefinită nu se modifică și nu se șterge: ascunde-o și scrie una proprie.';
    case testErrorReasons.notAwaiting:
      return 'Testul nu așteaptă acum angajatul: rezultatul la angajare se înregistrează după instruirea la angajare și înainte de promovare, iar cel anual după primul test promovat.';
    case testErrorReasons.examinerSigned:
      return 'Examinatorul a semnat deja fișa de test, așa că examinatorul rezultatului nu se mai schimbă.';
    case testErrorReasons.resultFromAttempt:
      return 'La un rezultat din portal se schimbă doar examinatorul.';
  }
  if (cause instanceof ApiHttpError && cause.status === 404) {
    return 'Nu mai există: altcineva l-a șters între timp. Reîncarcă pagina.';
  }
  if (cause instanceof ApiHttpError && cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return fallback;
}

export function invalidateTestBank(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: [getGetTestBankQueryKey()[0]] });
}

export function invalidateEmployeeTests(
  queryClient: QueryClient,
  clientId: string,
  employeeId: string
) {
  const employeesPrefix = getListEmployeesQueryKey(clientId)[0];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetEmployeeTestsQueryKey(clientId, employeeId) }),
    queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(clientId, employeeId) }),
    queryClient.invalidateQueries({ queryKey: [employeesPrefix] }),
    queryClient.invalidateQueries({ queryKey: [getListOrganizationEmployeesQueryKey()[0]] }),
  ]);
}
