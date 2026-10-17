import { maskCnp } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { getRouteApi } from '@tanstack/react-router';
import { Eye, EyeOff } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { EmployeeFilesCard } from '@/features/client-files/employee-files-card';
import { EmployeePortalCard } from '@/features/participants/employee-portal-card';

import { formatDate, formatTenure, todayIso } from './employee-format';
import { EmployeeJobPositionDialog } from './employee-job-position-dialog';
import { EmployeePending } from './employee-pending';
import { useEmployee } from './use-employee';

const employeeRoute = getRouteApi('/_authenticated/clients/$clientId/employees/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2 className="border-b px-5 py-3.5 text-sm font-semibold">{title}</h2>
      <dl className="grid gap-px bg-border sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'bg-card px-5 py-3.5 sm:col-span-2' : 'bg-card px-5 py-3.5'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words whitespace-pre-line">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

// Masked until asked for; hides again when the page is left.
function Cnp({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <span data-testid="employee-cnp-value" className="tabular-nums">
        {revealed ? value : maskCnp(value)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-testid="employee-cnp-toggle"
        aria-pressed={revealed}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {revealed ? 'Ascunde' : 'Arată'}
      </Button>
    </span>
  );
}

export function EmployeePage() {
  const { clientId, employeeId } = employeeRoute.useParams();
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const query = useEmployee(clientId, employeeId);
  const [moving, setMoving] = useState(false);
  const employee = query.data?.employee;
  if (!employee) return <EmployeePending />;
  const former = employee.status === 'terminated';
  const blood = [employee.bloodGroup, employee.rhFactor ? `Rh ${employee.rhFactor}` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-testid="employee-page">
      <div className="grid gap-6">
        <Section title="Identificare">
          <Fact label="Nume">{employee.lastName}</Fact>
          <Fact label="Prenume">{employee.firstName}</Fact>
          <Fact label="CNP">{employee.cnp ? <Cnp value={employee.cnp} /> : null}</Fact>
          <Fact label="Marca">{employee.employeeNumber}</Fact>
        </Section>

        <Section title="Angajare">
          <Fact label="Post de lucru">
            <span className="flex flex-wrap items-center gap-2">
              <span data-testid="employee-job-position">{employee.jobPosition.name}</span>
              {!former && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-testid="employee-job-position-change"
                  onClick={() => setMoving(true)}
                >
                  Schimbă…
                </Button>
              )}
            </span>
          </Fact>
          <Fact label="Funcția din contract">{employee.jobTitle}</Fact>
          <Fact label="Data angajării">{formatDate(employee.hiredAt)}</Fact>
          <Fact label={former ? 'Vechime la plecare' : 'Vechime'}>
            {formatTenure(employee.hiredAt, employee.terminatedAt ?? todayIso())}
          </Fact>
          <Fact label="Data plecării">
            {employee.terminatedAt ? formatDate(employee.terminatedAt) : null}
          </Fact>
        </Section>

        <Section title="Contact">
          <Fact label="Email">
            {employee.email && (
              <a href={`mailto:${employee.email}`} className="hover:underline">
                {employee.email}
              </a>
            )}
          </Fact>
          <Fact label="Telefon">
            {employee.phone && (
              <a href={`tel:${employee.phone.replace(/[^+\d]/g, '')}`} className="hover:underline">
                {employee.phone}
              </a>
            )}
          </Fact>
        </Section>

        <Section title="Fișa de instruire">
          <Fact label="Punct de lucru" wide>
            {employee.workplace?.name}
          </Fact>
          <Fact label="Data nașterii">
            {employee.birthDate ? formatDate(employee.birthDate) : null}
          </Fact>
          <Fact label="Locul nașterii">{employee.birthPlace}</Fact>
          <Fact label="Domiciliu" wide>
            {employee.homeAddress}
          </Fact>
          <Fact label="Grupa sanguină">{blood}</Fact>
          <Fact label="Calificarea">{employee.qualification}</Fact>
          <Fact label="Studiile">{employee.education}</Fact>
          <Fact label="Autorizații" wide>
            {employee.authorizations}
          </Fact>
          <Fact label="Traseul de deplasare" wide>
            {employee.commuteRoute}
          </Fact>
          <Fact label="Durata deplasării (minute)">{employee.commuteMinutes}</Fact>
          <Fact label="Observații" wide>
            {employee.notes}
          </Fact>
        </Section>

        {session && (
          <EmployeePortalCard
            employee={employee}
            userId={session.user.id}
            readOnly={client.archivedAt !== null}
          />
        )}

        <EmployeeFilesCard employee={employee} />
      </div>
      <EmployeeJobPositionDialog
        clientId={clientId}
        userId={session?.user.id ?? ''}
        employee={moving ? employee : null}
        onClose={() => setMoving(false)}
      />
    </div>
  );
}
