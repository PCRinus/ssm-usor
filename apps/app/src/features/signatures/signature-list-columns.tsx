import {
  capitalized,
  countOf,
  formatEmployeeName,
  type KnowledgeTest,
  type SignatureListSlot,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { workerNoun } from '@/features/employees/employee-format';
import { dateToIso, formatDate, todayIso } from '@/lib/dates';

import { agreementAwaitsEmployer, agreementSigned } from './signature-format';
import type { SignatureRow, SignatureWorker } from './signature-selection';

const helper = createDataTableColumns<SignatureRow>();

const testLabels: Record<KnowledgeTest, string> = {
  hiring: 'Test la angajare',
  annual: 'Test anual',
};

export const subjectLabel = (row: SignatureRow) =>
  row.phase ? trainingPhaseLabels[row.phase] : testLabels[row.test!];

const roleLabels: Record<SignatureListSlot, string> = {
  trainer: 'instructor',
  verifier: 'verificator',
  admitter: 'admite la lucru',
  examiner: 'examinator',
};

const joined = (parts: readonly string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}` : (parts[0] ?? '');

export function roleLabel(slots: readonly SignatureListSlot[]) {
  const text = joined(slots.map((slot) => roleLabels[slot]));
  return capitalized(text);
}

export function signAsPhrase(slots: readonly SignatureListSlot[]) {
  const roles = slots.filter((slot) => slot !== 'admitter').map((slot) => roleLabels[slot]);
  return joined([
    ...(roles.length > 0 ? [`ca ${joined(roles)}`] : []),
    ...(slots.includes('admitter') ? ['la „Admite la lucru”'] : []),
  ]);
}

export const signatureNoun = (count: number) => countOf(count, 'semnătură', 'semnături');

export function rowName(row: SignatureRow) {
  const what = row.phase
    ? `instruirea ${trainingPhaseLabels[row.phase].toLocaleLowerCase('ro')}`
    : `fișa de test, ${testLabels[row.test!].toLocaleLowerCase('ro')},`;
  return `${what} ${trainingDomainLabels[row.domain]} din ${formatDate(row.day)}`;
}

const dayMs = 86_400_000;

// Counted in the reader's own days, as the request date under it is shown.
export function waitingDays(issuedAt: string, today = todayIso()) {
  const issued = dateToIso(new Date(issuedAt));
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(issued)) / dayMs));
}

const waitingLabel = (days: number) =>
  days === 0 ? 'de azi' : days === 1 ? 'o zi' : countOf(days, 'zi', 'zile');

export function workerTab(row: SignatureRow, worker: SignatureWorker) {
  return {
    to:
      row.domain === 'ssm'
        ? ('/clienti/$clientId/angajati/$employeeId/instruire/ssm' as const)
        : ('/clienti/$clientId/angajati/$employeeId/instruire/su' as const),
    params: { clientId: row.client.id, employeeId: worker.employee.id },
    state: openedHere,
  };
}

const warning = 'font-medium text-warning-foreground';

function agreementNote(workers: readonly SignatureWorker[]) {
  const unsigned = workers.filter((worker) => !agreementSigned(worker.agreement?.state));
  if (unsigned.length === 0) return null;
  if (workers.length > 1) {
    return `${unsigned.length} fără act adițional semnat`;
  }
  return agreementAwaitsEmployer(unsigned[0]!.agreement)
    ? 'Act adițional așteaptă angajatorul'
    : 'Act adițional nesemnat';
}

export const signatureColumns = helper.columns([
  helper.accessor((row) => row.day, {
    id: 'day',
    header: 'Ziua',
    enableSorting: true,
    meta: {
      headerClassName: 'w-26 min-w-26',
      cellClassName: 'tabular-nums',
      skeletonClassName: 'w-20',
    },
    cell: ({ getValue }) => formatDate(getValue()),
  }),
  helper.display({
    id: 'subject',
    header: 'Ce semnezi',
    meta: { headerClassName: 'w-48 min-w-48', cellClassName: 'whitespace-normal' },
    cell: ({ row }) => (
      <>
        <span className="font-medium">{subjectLabel(row.original)}</span>
        <CellNote>
          {trainingDomainLabels[row.original.domain]}
          {row.original.kind === 'test_sheet' && ' · fișa de test'}
        </CellNote>
      </>
    ),
  }),
  helper.accessor((row) => row.client.name, {
    id: 'client',
    header: 'Client',
    enableSorting: true,
    meta: {
      headerClassName: 'w-full',
      cellClassName: 'min-w-48 whitespace-normal break-words',
      skeletonClassName: 'w-40',
    },
    cell: ({ row }) => (
      <Link
        to="/clienti/$clientId/instruiri-tinute"
        params={{ clientId: row.original.client.id }}
        state={openedHere}
        data-testid="signatures-client"
        className="hover:underline"
      >
        {row.original.client.name}
      </Link>
    ),
  }),
  helper.display({
    id: 'signAs',
    header: 'Semnezi ca',
    meta: { headerClassName: 'w-33 min-w-33', cellClassName: 'whitespace-normal' },
    cell: ({ row }) => (
      <span data-testid="signatures-sign-as">{roleLabel(row.original.slots)}</span>
    ),
  }),
  helper.display({
    id: 'workers',
    header: 'Lucrători',
    meta: {
      headerClassName: 'w-54 min-w-54',
      cellClassName: 'whitespace-normal break-words',
      skeletonClassName: 'w-28',
      personal: true,
    },
    cell: ({ row }) => {
      const { workers, signatures } = row.original;
      const one = workers.length === 1 ? workers[0]! : null;
      const note = agreementNote(workers);
      return (
        <div data-testid="signatures-workers">
          {one ? (
            <Link {...workerTab(row.original, one)} className="font-medium hover:underline">
              {formatEmployeeName(one.employee)}
            </Link>
          ) : (
            <span className="tabular-nums">{workerNoun(workers.length)}</span>
          )}
          {signatures !== workers.length && <CellNote>{signatureNoun(signatures)}</CellNote>}
          {note && (
            <CellNote className={warning} data-testid="signatures-agreement">
              {note}
            </CellNote>
          )}
        </div>
      );
    },
  }),
  helper.accessor((row) => row.issuedAt, {
    id: 'issuedAt',
    header: 'Așteaptă',
    enableSorting: true,
    meta: { headerClassName: 'w-31 min-w-31', skeletonClassName: 'w-20' },
    cell: ({ getValue }) => (
      <>
        <span className="tabular-nums">{waitingLabel(waitingDays(getValue()))}</span>
        <CellNote className="tabular-nums">
          din {formatDate(dateToIso(new Date(getValue())))}
        </CellNote>
      </>
    ),
  }),
]);
