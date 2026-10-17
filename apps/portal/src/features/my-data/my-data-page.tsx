import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { useGetPortalEmployeeData } from '@/api/generated/api';
import { Fact, Facts } from '@/components/facts';
import { cardClass, Page, PageFailed, PageGrid, PageHeader, PageLoading } from '@/components/page';
import { useParticipation } from '@/features/participation/participation-context';
import { useFormatDate } from '@/lib/format';
import { useApiRequest } from '@/lib/request';

import { ProviderBox } from './provider-box';

export function MyDataPage() {
  const { t } = useLingui();
  const participation = useParticipation();
  if (participation.employeeId === null) return <Navigate to="/" replace />;
  return (
    <Page testId="my-data-page">
      <PageHeader
        title={t`Datele mele`}
        description={t`Ce tipăresc fișele tale de instruire, așa cum le ține angajatorul.`}
      />
      <MyData participantId={participation.participantId} />
    </Page>
  );
}

function MyData({ participantId }: { participantId: string }) {
  const { t } = useLingui();
  const formatDate = useFormatDate();
  const apiRequest = useApiRequest();
  const data = useGetPortalEmployeeData(participantId, { request: apiRequest });
  if (data.isPending) return <PageLoading />;
  if (data.isError) return <PageFailed onRetry={() => void data.refetch()} />;
  const { employee, provider } = data.data;
  const birth = [employee.birthDate && formatDate(employee.birthDate), employee.birthPlace]
    .filter(Boolean)
    .join(', ');
  const rh = employee.rhFactor && (employee.rhFactor === '+' ? t`Rh pozitiv` : t`Rh negativ`);
  const minutes = employee.commuteMinutes;
  const blood = [employee.bloodGroup, rh].filter(Boolean).join(', ');

  return (
    <PageGrid>
      <div data-testid="my-data" className="grid gap-4 sm:gap-5 lg:col-span-8">
        <DataCard id="my-data-work" title={t`La locul de muncă`}>
          <Facts>
            <Fact label={t`Nume și prenume`}>{`${employee.lastName} ${employee.firstName}`}</Fact>
            <Fact label={t`Marca`}>{employee.employeeNumber}</Fact>
            <Fact label={t`Post de lucru`}>{employee.position}</Fact>
            <Fact label={t`Funcția din contract`}>{employee.contractTitle}</Fact>
            <Fact label={t`Punct de lucru`}>{employee.workplace}</Fact>
            <Fact label={t`Angajat din`}>{formatDate(employee.hiredAt)}</Fact>
          </Facts>
        </DataCard>
        <DataCard id="my-data-personal" title={t`Date personale`}>
          <Facts>
            <Fact label={t`Data și locul nașterii`}>{birth || null}</Fact>
            <Fact label={t`Domiciliu`}>{employee.homeAddress}</Fact>
            <Fact label={t`Grupa sanguină`}>{blood || null}</Fact>
            <Fact label={t`Studii`}>{employee.education}</Fact>
            <Fact label={t`Calificare`}>{employee.qualification}</Fact>
            <Fact label={t`Autorizații`}>{employee.authorizations}</Fact>
          </Facts>
        </DataCard>
        <DataCard
          id="my-data-commute"
          title={t`Traseul de deplasare`}
          description={t`Drumul tău obișnuit între casă și muncă. Un accident pe acest traseu, în durata lui normală, este accident de muncă.`}
        >
          <Facts>
            <Fact label={t`Ruta`}>{employee.commuteRoute}</Fact>
            <Fact label={t`Durata`}>
              {minutes === null
                ? null
                : t({
                    message: plural(minutes, {
                      one: '# minut',
                      few: '# minute',
                      other: '# de minute',
                    }),
                  })}
            </Fact>
          </Facts>
        </DataCard>
      </div>
      <aside className="grid gap-4 lg:sticky lg:top-22 lg:col-span-4">
        <ProviderBox
          testId="my-data-correction"
          provider={provider}
          lead={t`Datele le ține angajatorul tău; specialistul SSM le corectează.`}
        />
        <p className="px-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
          <Trans>
            Un câmp necompletat apare gol și pe fișă, în afară de traseul de deplasare, pe care fișa
            SSM îl cere.
          </Trans>
        </p>
      </aside>
    </PageGrid>
  );
}

function DataCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`${cardClass} grid gap-3 px-4 py-4 sm:gap-3.5 sm:px-5.5 sm:py-5`}
    >
      <div className="grid gap-0.5">
        <h2 id={id} className="text-[0.9375rem] font-semibold sm:text-base">
          {title}
        </h2>
        {description && (
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
