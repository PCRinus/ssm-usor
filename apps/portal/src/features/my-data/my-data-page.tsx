import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { type PortalEmployeeDataResponse, useGetPortalEmployeeData } from '@/api/generated/api';
import { PageFailed, PageHeader, PageLoading } from '@/components/page';
import { useParticipation } from '@/features/participation/participation-context';
import { formatDate } from '@/lib/format';
import { useApiRequest } from '@/lib/request';

export function MyDataPage() {
  const participation = useParticipation();
  if (participation.employeeId === null) return <Navigate to="/" replace />;
  return (
    <main data-testid="my-data-page">
      <PageHeader eyebrow={participation.clientName} title="Datele mele">
        Așa cum sunt trecute pe fișele tale de instruire.
      </PageHeader>
      <MyData participantId={participation.participantId} />
    </main>
  );
}

function MyData({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const data = useGetPortalEmployeeData(participantId, { request: apiRequest });
  if (data.isPending) return <PageLoading />;
  if (data.isError) return <PageFailed onRetry={() => void data.refetch()} />;
  const { employee, provider } = data.data;

  return (
    <div className="grid gap-6">
      <dl
        data-testid="my-data"
        className="divide-y rounded-xl border bg-card px-4 shadow-xs [&>div]:grid [&>div]:gap-0.5 [&>div]:py-3"
      >
        <Fact label="Nume și prenume">{`${employee.lastName} ${employee.firstName}`}</Fact>
        <Fact label="Număr matricol">{employee.employeeNumber}</Fact>
        <Fact label="Postul">{employee.position}</Fact>
        <Fact label="Locul de muncă">{employee.workplace}</Fact>
        <Fact label="Funcția din contract">{employee.contractTitle}</Fact>
        <Fact label="Domiciliul">{employee.homeAddress}</Fact>
        <Fact label="Data și locul nașterii">{birthOf(employee)}</Fact>
        <Fact label="Grupa sanguină și Rh">{bloodOf(employee)}</Fact>
        <Fact label="Calificarea">{employee.qualification}</Fact>
        <Fact label="Studiile">{employee.education}</Fact>
        <Fact label="Autorizații">{employee.authorizations}</Fact>
        <Fact label="Traseul de deplasare la și de la locul de muncă">{employee.commuteRoute}</Fact>
        <Fact label="Durata deplasării">
          {employee.commuteMinutes === null ? null : `${employee.commuteMinutes} min`}
        </Fact>
        <Fact label="Data angajării">{formatDate(employee.hiredAt)}</Fact>
      </dl>
      <p data-testid="my-data-correction" className="leading-relaxed">
        Ceva nu e corect? Spune-i specialistului: {provider.name}
        {provider.phone && (
          <>
            ,{' '}
            <a
              href={`tel:${provider.phone.replace(/[^\d+]/g, '')}`}
              className="font-medium whitespace-nowrap underline underline-offset-4"
            >
              {provider.phone}
            </a>
          </>
        )}
        .
      </p>
    </div>
  );
}

type Employee = PortalEmployeeDataResponse['employee'];

function birthOf(employee: Employee) {
  const parts = [employee.birthDate && formatDate(employee.birthDate), employee.birthPlace].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function bloodOf(employee: Employee) {
  const rh = employee.rhFactor && (employee.rhFactor === '+' ? 'Rh pozitiv' : 'Rh negativ');
  const parts = [employee.bloodGroup, rh].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">
        {children ?? <span className="text-muted-foreground">Necompletat</span>}
      </dd>
    </div>
  );
}
