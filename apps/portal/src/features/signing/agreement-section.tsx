import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';

import { useGetPortalSigningAgreementState } from '@/api/generated/api';
import { cardClass } from '@/components/page';
import type { Participation } from '@/features/participation/participation-context';
import { useFormatDate } from '@/lib/format';
import { useApiRequest } from '@/lib/request';

import { AgreementPdfButton } from './agreement-pdf-button';
import { awaitsEmployee, type OwnAgreement } from './signing-items';

export function AgreementSection({ participation }: { participation: Participation }) {
  const apiRequest = useApiRequest();
  const employeeId = participation.employeeId;
  const state = useGetPortalSigningAgreementState(participation.participantId, {
    request: apiRequest,
    query: { enabled: employeeId !== null },
  });
  if (employeeId === null || !state.data) return null;
  const agreement = state.data.agreement;
  const canSign = awaitsEmployee(agreement);

  return (
    <section
      aria-labelledby="agreement-title"
      data-testid="account-agreement"
      data-state={agreement?.state ?? 'none'}
      className={cn(cardClass, 'grid gap-3 px-4 py-4 sm:px-5')}
    >
      <div className="grid gap-1">
        <h2 id="agreement-title" className="font-semibold">
          <Trans>Actul adițional privind semnarea electronică</Trans>
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Trans>
            Actul adițional la contractul de muncă prin care accepți să semnezi fișele de instruire
            în portal.
          </Trans>
        </p>
      </div>
      <AgreementState agreement={agreement} />
      {agreement && (
        <div className="flex flex-wrap gap-2">
          {canSign && (
            <Button asChild className="h-10 px-4">
              <Link
                to="/semneaza"
                search={{ acord: employeeId }}
                data-testid="account-agreement-sign"
              >
                <PenLine aria-hidden="true" />
                <Trans>Semnează</Trans>
              </Link>
            </Button>
          )}
          <AgreementPdfButton participation={participation} employeeId={employeeId} />
        </div>
      )}
    </section>
  );
}

function AgreementState({ agreement }: { agreement: OwnAgreement }) {
  const { t } = useLingui();
  const formatDate = useFormatDate();
  const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : '');
  const text = !agreement
    ? t`Specialistul nu l-a pregătit încă.`
    : agreement.state === 'signed_on_paper'
      ? t`Semnat pe hârtie.`
      : agreement.state === 'in_contract'
        ? t`Clauza este în contractul tău de muncă.`
        : agreement.state === 'withdrawn'
          ? t`Ai revenit la semnarea de mână: fișele tale se semnează pe hârtie.`
          : agreement.state === 'signed_electronically'
            ? t`Semnat electronic de ambele părți pe ${day(agreement.employerSignedAt ?? agreement.signedAt)}.`
            : agreement.employeeSignedAt
              ? t`L-ai semnat pe ${day(agreement.employeeSignedAt)}. Așteaptă semnătura angajatorului.`
              : t`Așteaptă semnătura ta.`;
  const done =
    agreement?.state === 'signed_electronically' ||
    agreement?.state === 'signed_on_paper' ||
    agreement?.state === 'in_contract';
  return (
    <p
      data-testid="account-agreement-state"
      className={cn(
        'w-fit rounded-md px-2.5 py-1 text-sm font-medium',
        done ? 'bg-success text-success-foreground' : 'bg-muted text-foreground'
      )}
    >
      {text}
    </p>
  );
}
