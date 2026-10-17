import { currentPrivacyNoticeVersion } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';

import {
  getGetPortalMeQueryKey,
  type PortalMeResponse,
  useRecordPortalNotice,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
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
          <>
            Ai acces la portal pentru <strong>{clientName}</strong>.
          </>
        ) : (
          <>
            <strong>{clientName}</strong> este angajatorul tău.
          </>
        )}{' '}
        Evidența instruirilor de securitate și sănătate în muncă (SSM) și de situații de urgență
        (PSI) o ține <strong>{organizationName}</strong>, prestatorul de servicii SSM al companiei,
        în numele ei.
      </p>
      <p>
        {administrator
          ? 'Aici vezi angajații companiei, stadiul instruirii lor și fișele lor individuale de instruire.'
          : 'Aici vezi instruirile tale, fișele tale individuale de instruire și datele tale de identificare, așa cum sunt trecute pe fișe.'}
      </p>
      <p>
        Angajatorul este obligat să țină aceste evidențe de Legea nr. 319/2006 a securității și
        sănătății în muncă, de HG nr. 1425/2006 și de OMAI nr. 712/2005. Datele sunt prelucrate
        pentru aceste obligații legale, nu pe baza unui acord pe care să ți-l cerem, iar portalul
        doar ți le arată. Dacă ceva nu este corect, spune-i specialistului {organizationName}.
      </p>
      <p>
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
      </p>
    </div>
  );
}

export function PrivacyNoticeGate({ participation }: { participation: Participation }) {
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
    <main data-testid="privacy-notice" className="grid gap-6 py-10">
      <div className="grid gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Bun venit, {participation.fullName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Cum folosim datele tale</h1>
      </div>
      <PrivacyNoticeText participation={participation} />
      {record.isError && (
        <Notice variant="destructive" data-testid="privacy-notice-error">
          Nu am putut salva. Verifică conexiunea la internet și încearcă din nou.
        </Notice>
      )}
      <Button
        data-testid="privacy-notice-accept"
        className="h-12 w-full text-base"
        disabled={record.isPending}
        onClick={acknowledge}
      >
        {record.isPending ? 'Se salvează…' : 'Am înțeles'}
      </Button>
    </main>
  );
}
