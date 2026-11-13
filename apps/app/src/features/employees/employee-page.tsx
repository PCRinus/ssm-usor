import { commuteMeansLabels, type CommuteMeansValue, maskCnp } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { getRouteApi } from '@tanstack/react-router';
import { Eye, EyeOff } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { replayMask, replayShape } from '@/app/observability/replay-masking';
import { Shaped } from '@/components/replay';
import { useAuth } from '@/features/auth/auth-context';
import { EmployeePortalCard } from '@/features/participants/employee-portal-card';
import { SigningAgreementCard } from '@/features/signatures/signing-agreement-card';

import { formatDate, formatTenure, todayIso } from './employee-format';
import { EmployeeJobPositionDialog } from './employee-job-position-dialog';
import { EmployeePending } from './employee-pending';
import { useEmployee } from './use-employee';

const employeeRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2 className="border-b px-5 py-3.5 text-sm font-semibold">{title}</h2>
      <dl className="grid gap-px bg-border sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Fact({
  label,
  wide,
  replay,
  children,
}: {
  label: string;
  wide?: boolean;
  replay?: 'mask' | 'shape';
  children: ReactNode;
}) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'bg-card px-5 py-3.5 sm:col-span-2' : 'bg-card px-5 py-3.5'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className="mt-0.5 text-sm font-medium break-words whitespace-pre-line"
        {...(replay === 'mask' && replayMask)}
        {...(replay === 'shape' && replayShape)}
      >
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
      <span data-testid="employee-cnp-value" className="tabular-nums" {...replayMask}>
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

function commuteMeansText({ means, other }: CommuteMeansValue) {
  const chosen = commuteMeansLabels({ means, other: null }).join(', ');
  const typed = other?.trim();
  if (!chosen && !typed) return null;
  return (
    <>
      {chosen}
      {chosen && typed && ', '}
      {typed && <Shaped>{typed}</Shaped>}
    </>
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
          <Fact label="Nume" replay="mask">
            {employee.lastName}
          </Fact>
          <Fact label="Prenume" replay="mask">
            {employee.firstName}
          </Fact>
          <Fact label="CNP">{employee.cnp ? <Cnp value={employee.cnp} /> : null}</Fact>
          <Fact label="Marca" replay="mask">
            {employee.employeeNumber}
          </Fact>
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
          <Fact label="Nr. contract" replay="mask">
            {employee.contractNumber}
          </Fact>
          <Fact label="Data angajării">{formatDate(employee.hiredAt)}</Fact>
          <Fact label={former ? 'Vechime la plecare' : 'Vechime'}>
            {formatTenure(employee.hiredAt, employee.terminatedAt ?? todayIso())}
          </Fact>
          <Fact label="Data plecării">
            {employee.terminatedAt ? formatDate(employee.terminatedAt) : null}
          </Fact>
        </Section>

        <Section title="Contact">
          <Fact label="Email" replay="mask">
            {employee.email && (
              <a href={`mailto:${employee.email}`} className="hover:underline">
                {employee.email}
              </a>
            )}
          </Fact>
          <Fact label="Telefon" replay="mask">
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
          <Fact label="Data nașterii" replay="mask">
            {employee.birthDate ? formatDate(employee.birthDate) : null}
          </Fact>
          <Fact label="Locul nașterii" replay="mask">
            {employee.birthPlace}
          </Fact>
          <Fact label="Domiciliu" wide replay="shape">
            {employee.homeAddress}
          </Fact>
          <Fact label="Adresa unde locuiește" wide replay="shape">
            {employee.residenceAddress}
          </Fact>
          <Fact label="Grupa sanguină" replay="mask">
            {blood}
          </Fact>
          <Fact label="Calificarea" replay="mask">
            {employee.qualification}
          </Fact>
          <Fact label="Studiile" replay="mask">
            {employee.education}
          </Fact>
          <Fact label="Autorizații" wide replay="mask">
            {employee.authorizations}
          </Fact>
          <Fact label="Traseul de deplasare" wide replay="shape">
            {employee.commuteRoute}
          </Fact>
          <Fact label="Mijloace de transport">
            {commuteMeansText({ means: employee.commuteMeans, other: employee.commuteMeansOther })}
          </Fact>
          <Fact label="Durata deplasării (minute)">{employee.commuteMinutes}</Fact>
          <Fact label="Observații" wide replay="mask">
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

        {session && (
          <SigningAgreementCard
            employee={employee}
            userId={session.user.id}
            readOnly={client.archivedAt !== null}
          />
        )}
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
