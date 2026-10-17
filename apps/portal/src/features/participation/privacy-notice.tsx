import { Trans, useLingui } from '@lingui/react/macro';
import { currentPrivacyNoticeVersion } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';

import {
  getGetPortalMeQueryKey,
  type PortalMeResponse,
  useRecordPortalNotice,
} from '@/api/generated/api';
import { PublicFrame } from '@/app/public-frame';
import { Notice } from '@/components/notice';
import { ParticipantLanguageSwitch } from '@/features/language/language-switch';
import { useApiRequest } from '@/lib/request';

import { isAdministrator, type Participation } from './participation-context';

export const privacyPolicyUrl = 'https://ssmusor.ro/confidentialitate';

export function PrivacyNoticeText({ participation }: { participation: Participation }) {
  const { clientName, organizationName } = participation;
  const administrator = isAdministrator(participation);
  return (
    <div data-testid="privacy-notice-text" className="grid gap-4 leading-relaxed">
      <p>
        {administrator ? (
          <Trans>
            Ai acces la portal pentru <strong>{clientName}</strong>.
          </Trans>
        ) : (
          <Trans>
            <strong>{clientName}</strong> este angajatorul tău.
          </Trans>
        )}{' '}
        <Trans>
          Evidența instruirilor de securitate și sănătate în muncă (SSM) și de situații de urgență
          (PSI) o ține <strong>{organizationName}</strong>, prestatorul de servicii SSM al
          companiei, în numele ei.
        </Trans>
      </p>
      {administrator ? (
        <p data-testid="privacy-notice-administrator">
          <Trans>
            Aici vezi, în numele angajatorului, angajații companiei cu stadiul instruirii lor,
            instruirile fiecăruia și fișele lor individuale de instruire, precum și persoanele
            responsabile desemnate de companie. Sunt date personale ale angajaților, puse la
            dispoziția ta doar ca să urmărești aceste evidențe pentru companie. Despre tine păstrăm
            numele și adresa la care ai primit invitația, ca să te poți conecta.
          </Trans>
          {participation.employeeId !== null && (
            <>
              {' '}
              <Trans>
                Fiind și angajat, vezi și instruirile tale, fișele tale și datele tale de
                identificare.
              </Trans>
            </>
          )}
        </p>
      ) : (
        <p>
          <Trans>
            Aici vezi instruirile tale, fișele tale individuale de instruire și datele tale de
            identificare, așa cum sunt trecute pe fișe.
          </Trans>
        </p>
      )}
      <p>
        <Trans>
          Angajatorul este obligat să țină aceste evidențe de Legea nr. 319/2006 a securității și
          sănătății în muncă, de HG nr. 1425/2006 și de OMAI nr. 712/2005. Datele sunt prelucrate
          pentru aceste obligații legale, nu pe baza unui acord pe care să ți-l cerem, iar portalul
          doar ți le arată. Dacă ceva nu este corect, spune-i specialistului {organizationName}.
        </Trans>
      </p>
      <p>
        <Trans>
          Mai multe despre cum sunt păstrate și protejate datele găsești în{' '}
          <a
            href={privacyPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            politica de confidențialitate
          </a>
          .
        </Trans>
      </p>
    </div>
  );
}

export function PrivacyNoticeGate({ participation }: { participation: Participation }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const record = useRecordPortalNotice({ request: apiRequest });

  function acknowledge() {
    record.mutate(
      {
        participantId: participation.participantId,
        data: { version: currentPrivacyNoticeVersion },
      },
      {
        onSuccess() {
          queryClient.setQueryData<PortalMeResponse>(getGetPortalMeQueryKey(), (me) =>
            me
              ? {
                  participations: me.participations.map((item) =>
                    item.participantId === participation.participantId
                      ? { ...item, noticeVersion: currentPrivacyNoticeVersion }
                      : item
                  ),
                }
              : me
          );
        },
      }
    );
  }

  return (
    <PublicFrame
      testId="privacy-notice"
      languageSwitch={<ParticipantLanguageSwitch participation={participation} />}
      title={t`Cum folosim datele tale`}
      description={t`Bun venit, ${participation.fullName}`}
    >
      <div className="text-left text-[0.9375rem]">
        <PrivacyNoticeText participation={participation} />
      </div>
      {record.isError && (
        <Notice variant="destructive" data-testid="privacy-notice-error">
          <Trans>Nu am putut salva. Verifică conexiunea la internet și încearcă din nou.</Trans>
        </Notice>
      )}
      <Button
        data-testid="privacy-notice-accept"
        className="h-12 w-full text-base"
        disabled={record.isPending}
        onClick={acknowledge}
      >
        {record.isPending ? t`Se salvează…` : t`Am înțeles`}
      </Button>
    </PublicFrame>
  );
}
