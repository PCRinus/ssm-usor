import {
  commuteMeansLabels,
  type CommuteMeansValue,
  countOf,
  maskCnp,
  type MissingSheetData,
} from '@ssm-usor/contracts';
import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Button } from '@ssm-usor/ui/components/button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowRightLeft, Eye, EyeOff, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type { TrainingSheetsResponse } from '@/api/generated/api';
import { replayMask } from '@/app/observability/replay-masking';
import { openedFromRecord, openedHere } from '@/app/opener';
import { Masked, Shaped } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import {
  SummaryEmpty,
  SummaryList,
  SummaryNote,
  SummaryRow,
} from '@/features/clients/details/summary-list';
import type { EmployeeFocus } from '@/features/missing-data/focus';
import { useTrainingSheets } from '@/features/training-sheets/use-training-sheets';
import { formatDate, todayIso } from '@/lib/dates';

import { formatTenure } from './employee-format';
import { EmployeeJobPositionDialog } from './employee-job-position-dialog';
import { EmployeePending } from './employee-pending';
import { LinkText } from './link-text';
import { useEmployee } from './use-employee';

const employeeRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

const values = '[&_dd>div:first-child]:font-medium';

function Note({ children }: { children: ReactNode }) {
  return <SummaryNote className="font-normal">{children}</SummaryNote>;
}

function Panel({
  title,
  help,
  edit,
  testId,
  children,
}: {
  title: string;
  help?: HelpTopic;
  edit: ReactNode;
  testId: string;
  children: ReactNode;
}) {
  return (
    <SectionCard data-testid={testId} className="gap-4" title={title} help={help} action={edit}>
      {children}
    </SectionCard>
  );
}

function EditLink({
  focus,
  subject,
  adding = false,
  testId,
}: {
  focus: EmployeeFocus;
  subject: string;
  adding?: boolean;
  testId: string;
}) {
  const { clientId, employeeId } = employeeRoute.useParams();
  const verb = adding ? 'Adaugă' : 'Modifică';
  return (
    <Button asChild variant="secondary" size="sm" data-testid={testId}>
      <Link
        to="/clienti/$clientId/angajati/$employeeId/editare"
        params={{ clientId, employeeId }}
        search={{ focus }}
        state={openedFromRecord(`/clienti/${clientId}/angajati/${employeeId}`)}
        aria-label={`${verb} ${subject}`}
      >
        {adding ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
        {verb}
      </Link>
    </Button>
  );
}

function PostLink({
  clientId,
  post,
}: {
  clientId: string;
  post: { id: string; name: string; archived: boolean };
}) {
  if (post.archived) return <span data-testid="employee-job-position">{post.name}</span>;
  return (
    <Link
      to="/clienti/$clientId/posturi/$jobPositionId"
      params={{ clientId, jobPositionId: post.id }}
      state={openedHere}
      data-testid="employee-job-position"
      className="underline-offset-4 hover:underline"
    >
      <LinkText>{post.name}</LinkText>
    </Link>
  );
}

function Missing({ sheets }: { sheets: string[] }) {
  return (
    <span
      data-testid="employee-missing"
      className="inline-flex items-start gap-1.5 text-warning-foreground"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {sheets.length > 1
        ? `Lipsește pentru fișele ${sheets.join(' și ')}`
        : `Lipsește pentru fișa ${sheets[0]}`}
    </span>
  );
}

function sheetsLacking(readiness: TrainingSheetsResponse | undefined, data: MissingSheetData) {
  if (!readiness) return [];
  return [
    ...(readiness.ssm.missing.includes(data) ? ['SSM'] : []),
    ...(readiness.su.missing.includes(data) ? ['SU'] : []),
  ];
}

// Masked until asked for; hides again when the page is left.
function Cnp({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <span data-testid="employee-cnp-value" className="tabular-nums" {...replayMask}>
        {revealed ? value : maskCnp(value)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="-my-1.5 text-section-tab-foreground max-sm:-my-3 max-sm:size-11"
        data-testid="employee-cnp-toggle"
        aria-label="Arată CNP-ul"
        aria-pressed={revealed}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </span>
  );
}

function commuteLine({ means, other }: CommuteMeansValue, minutes: number | null) {
  const chosen = commuteMeansLabels({ means, other: null }).join(', ');
  const typed = other?.trim();
  const parts: ReactNode[] = [];
  if (chosen || typed) {
    parts.push(
      <span key="means">
        {chosen}
        {chosen && typed && ', '}
        {typed && <Shaped>{typed}</Shaped>}
      </span>
    );
  }
  if (minutes !== null) {
    parts.push(<span key="minutes">{countOf(minutes, 'minut', 'minute')}</span>);
  }
  if (parts.length === 0) return null;
  return parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]));
}

export function EmployeePage() {
  const { clientId, employeeId } = employeeRoute.useParams();
  const { client } = clientRoute.useLoaderData();
  const query = useEmployee(clientId, employeeId);
  const readiness = useTrainingSheets(clientId, employeeId);
  const [moving, setMoving] = useState(false);
  const employee = query.data?.employee;
  if (!employee) return <EmployeePending />;
  const readOnly = client.archivedAt !== null;
  const former = employee.status === 'terminated';
  const blood = [employee.bloodGroup, employee.rhFactor ? `Rh ${employee.rhFactor}` : null]
    .filter(Boolean)
    .join(' ');
  const workplaceLacking = employee.workplace
    ? []
    : sheetsLacking(readiness.data, 'employee.workplace');
  const routeLacking = employee.commuteRoute
    ? []
    : sheetsLacking(readiness.data, 'employee.commute_route');
  const commute = commuteLine(
    { means: employee.commuteMeans, other: employee.commuteMeansOther },
    employee.commuteMinutes
  );
  const edit = (focus: EmployeeFocus, subject: string, testId: string) =>
    !readOnly && <EditLink focus={focus} subject={subject} testId={testId} />;
  const add = (focus: EmployeeFocus, subject: string, testId: string) =>
    !readOnly && <EditLink focus={focus} subject={subject} testId={testId} adding />;

  return (
    <div data-testid="employee-page" className="grid gap-4">
      <Panel
        title="Angajare"
        help="angajati.angajare"
        testId="employee-employment"
        edit={edit('employment', 'angajarea', 'employee-employment-edit')}
      >
        <SummaryList className={values}>
          <SummaryRow
            label="Post de lucru"
            action={
              !former &&
              !readOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Schimbă postul de lucru"
                  data-testid="employee-job-position-change"
                  onClick={() => setMoving(true)}
                >
                  <ArrowRightLeft aria-hidden="true" />
                  Schimbă postul…
                </Button>
              )
            }
          >
            <PostLink clientId={clientId} post={employee.jobPosition} />
          </SummaryRow>
          <SummaryRow label="Funcția din contract">{employee.jobTitle}</SummaryRow>
          <SummaryRow
            label="Punct de lucru"
            action={
              workplaceLacking.length > 0 &&
              add('workplace', 'punctul de lucru', 'employee-workplace-add')
            }
          >
            {workplaceLacking.length > 0 ? (
              <Missing sheets={workplaceLacking} />
            ) : (
              employee.workplace?.name
            )}
          </SummaryRow>
          <SummaryRow label="Data angajării">
            <span className="tabular-nums">{formatDate(employee.hiredAt)}</span>
            {!former && <Note>vechime: {formatTenure(employee.hiredAt, todayIso())}</Note>}
          </SummaryRow>
          {former && (
            <SummaryRow label="Data încetării">
              {employee.terminatedAt && (
                <>
                  <span className="tabular-nums">{formatDate(employee.terminatedAt)}</span>
                  <Note>
                    vechime la plecare: {formatTenure(employee.hiredAt, employee.terminatedAt)}
                  </Note>
                </>
              )}
            </SummaryRow>
          )}
          <SummaryRow label="Nr. contract">
            {employee.contractNumber && (
              <Masked className="tabular-nums">{employee.contractNumber}</Masked>
            )}
          </SummaryRow>
          <SummaryRow label="Marca">
            {employee.employeeNumber && (
              <Masked className="tabular-nums">{employee.employeeNumber}</Masked>
            )}
          </SummaryRow>
        </SummaryList>
      </Panel>

      <Panel
        title="Identitate"
        testId="employee-identity"
        edit={edit('identity', 'identitatea', 'employee-identity-edit')}
      >
        <SummaryList className={values}>
          <SummaryRow label="Nume">
            {employee.lastName && <Masked>{employee.lastName}</Masked>}
          </SummaryRow>
          <SummaryRow label="Prenume">
            {employee.firstName && <Masked>{employee.firstName}</Masked>}
          </SummaryRow>
          <SummaryRow label="CNP">{employee.cnp && <Cnp value={employee.cnp} />}</SummaryRow>
          <SummaryRow label="Data și locul nașterii">
            {(employee.birthDate || employee.birthPlace) && (
              <>
                {employee.birthDate && (
                  <Masked className="tabular-nums">{formatDate(employee.birthDate)}</Masked>
                )}
                {employee.birthDate && employee.birthPlace && ', '}
                {employee.birthPlace && <Masked>{employee.birthPlace}</Masked>}
              </>
            )}
          </SummaryRow>
          <SummaryRow label="Grupa sanguină">{blood && <Masked>{blood}</Masked>}</SummaryRow>
        </SummaryList>
      </Panel>

      <Panel
        title="Contact și adrese"
        testId="employee-contact"
        edit={edit('contact', 'contactul și adresele', 'employee-contact-edit')}
      >
        <SummaryList className={values}>
          <SummaryRow label="Email">
            {employee.email && (
              <a
                href={`mailto:${employee.email}`}
                className="underline-offset-4 hover:underline"
                {...replayMask}
              >
                {employee.email}
              </a>
            )}
          </SummaryRow>
          <SummaryRow label="Telefon">
            {employee.phone && (
              <a
                href={`tel:${employee.phone.replace(/[^+\d]/g, '')}`}
                className="tabular-nums underline-offset-4 hover:underline"
                {...replayMask}
              >
                {employee.phone}
              </a>
            )}
          </SummaryRow>
          <SummaryRow label="Domiciliu">
            {employee.homeAddress && <Shaped>{employee.homeAddress}</Shaped>}
          </SummaryRow>
          <SummaryRow label="Adresa unde locuiește">
            {employee.residenceAddress && <Shaped>{employee.residenceAddress}</Shaped>}
          </SummaryRow>
        </SummaryList>
      </Panel>

      <Panel
        title="Pentru fișele de instruire"
        help="angajati.date-fisa"
        testId="employee-sheet-data"
        edit={edit('sheet-data', 'datele pentru fișe', 'employee-sheet-data-edit')}
      >
        <SummaryList className={values}>
          <SummaryRow label="Calificarea">
            {employee.qualification && <Masked>{employee.qualification}</Masked>}
          </SummaryRow>
          <SummaryRow label="Studiile">
            {employee.education && <Masked>{employee.education}</Masked>}
          </SummaryRow>
          <SummaryRow label="Autorizații">
            {employee.authorizations && <Masked>{employee.authorizations}</Masked>}
          </SummaryRow>
          <SummaryRow
            label="Traseul de deplasare"
            action={
              routeLacking.length > 0 &&
              add('commute-route', 'traseul de deplasare', 'employee-commute-route-add')
            }
          >
            {(employee.commuteRoute || routeLacking.length > 0 || commute) && (
              <>
                {employee.commuteRoute ? (
                  <Shaped>{employee.commuteRoute}</Shaped>
                ) : routeLacking.length > 0 ? (
                  <Missing sheets={routeLacking} />
                ) : (
                  <SummaryEmpty />
                )}
                {commute && <Note>{commute}</Note>}
              </>
            )}
          </SummaryRow>
        </SummaryList>
      </Panel>

      <Panel
        title="Observații"
        testId="employee-notes"
        edit={edit('notes', 'observațiile', 'employee-notes-edit')}
      >
        {employee.notes ? (
          <p
            className="max-w-[70ch] text-sm font-medium wrap-anywhere whitespace-pre-line"
            {...replayMask}
          >
            {employee.notes}
          </p>
        ) : (
          <p className="text-sm">
            <SummaryEmpty />
          </p>
        )}
      </Panel>

      <EmployeeJobPositionDialog
        clientId={clientId}
        employee={moving ? employee : null}
        onClose={() => setMoving(false)}
      />
    </div>
  );
}
