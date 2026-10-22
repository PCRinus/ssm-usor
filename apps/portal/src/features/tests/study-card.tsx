import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  testErrorReasons,
  testPassMarkPercent,
  testSittingSize,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { FileText, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { getPortalMaterial, type TestStudyCard } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { cardClass, SectionLabel } from '@/components/page';
import { romanianDayOf, useFormatDate } from '@/lib/format';
import { useApiRequest } from '@/lib/request';
import { openPreview, PreviewBlockedError } from '@/lib/save-file';

import { reasonOf } from './test-errors';

const passScore = Math.ceil((testSittingSize * testPassMarkPercent) / 100);

export function StudyCard({
  participantId,
  domain,
  card,
  awaiting,
  inProgress,
  starting,
  startFailure,
  onStart,
}: {
  participantId: string;
  domain: TrainingDomain;
  card: TestStudyCard;
  awaiting: boolean;
  inProgress: boolean;
  starting: boolean;
  startFailure: string | null;
  onStart: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="grid gap-6">
      <section aria-labelledby="study-card-title" className="grid gap-2.5">
        <SectionLabel id="study-card-title">{t`Ce trebuie să știi`}</SectionLabel>
        {card.explanations.length > 0 ? (
          <ul
            data-testid="study-card-explanations"
            className={cn(cardClass, 'divide-y overflow-hidden')}
          >
            {card.explanations.map((explanation, index) => (
              <li
                key={index}
                className="px-4 py-3 text-[0.9375rem] leading-relaxed sm:px-5"
                data-testid="study-card-explanation"
              >
                {explanation}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] leading-relaxed text-foreground/80">
            <Trans>Testul nu are explicații pe scurt.</Trans>
          </p>
        )}
      </section>
      <MaterialRow participantId={participantId} domain={domain} material={card.material} />
      {awaiting ? (
        <div className="grid gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t`Zece întrebări, fără limită de timp. Promovezi cu cel puțin ${passScore} răspunsuri corecte și poți relua testul oricând.`}
          </p>
          {startFailure && (
            <Notice variant="destructive" data-testid="test-start-error">
              {startFailure}
            </Notice>
          )}
          <Button
            data-testid="test-start"
            className="h-12 w-full text-base sm:w-fit sm:px-8"
            disabled={starting}
            onClick={onStart}
          >
            {starting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {inProgress ? t`Continuă testul` : t`Începe testul`}
          </Button>
        </div>
      ) : (
        <Notice variant="info" data-testid="test-not-awaiting">
          <Trans>Testul nu te așteaptă acum. Când va fi de susținut, apare pe Acasă.</Trans>
        </Notice>
      )}
    </div>
  );
}

function MaterialRow({
  participantId,
  domain,
  material,
}: {
  participantId: string;
  domain: TrainingDomain;
  material: TestStudyCard['material'];
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const formatDate = useFormatDate();
  const [busy, setBusy] = useState(false);
  const [notIssued, setNotIssued] = useState(false);
  const [failure, setFailure] = useState<MessageDescriptor | null>(null);

  if (!material || notIssued) {
    return (
      <p data-testid="test-material-missing" className="text-sm leading-relaxed text-foreground/80">
        {domain === 'ssm'
          ? t`Materialul de instruire nu este emis încă; îl găsești aici după ce îl emite specialistul.`
          : t`Instrucțiunile proprii PSI nu sunt emise încă; le găsești aici după ce le emite specialistul.`}
      </p>
    );
  }

  async function open(title: string) {
    setBusy(true);
    setFailure(null);
    try {
      await openPreview(() => getPortalMaterial(participantId, domain, apiRequest), {
        title,
        pending: t`Se pregătește materialul…`,
      });
    } catch (cause) {
      if (reasonOf(cause) === testErrorReasons.materialNotIssued) setNotIssued(true);
      else setFailure(failureOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const issuedOn = formatDate(romanianDayOf(material.issuedAt), 'short');
  return (
    <section
      aria-labelledby="test-material-title"
      data-testid="test-material"
      className={cn(cardClass, 'grid gap-3 px-4 py-3.5 sm:px-5')}
    >
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="grid gap-0.5">
          <h2 id="test-material-title" className="text-[0.9375rem] font-semibold">
            {material.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t`Materialul complet, emis pe ${issuedOn}.`}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        data-testid="test-material-open"
        className="h-11 w-full sm:w-fit"
        disabled={busy}
        onClick={() => void open(material.title)}
      >
        {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
        <Trans>Deschide PDF</Trans>
      </Button>
      {failure && (
        <Notice variant="destructive" data-testid="test-material-error">
          {i18n._(failure)}
        </Notice>
      )}
    </section>
  );
}

function failureOf(cause: unknown): MessageDescriptor {
  if (cause instanceof PreviewBlockedError) {
    return msg`Browserul a blocat fereastra nouă. Permite ferestrele noi pentru portal.`;
  }
  return msg`Nu am putut deschide materialul. Verifică conexiunea la internet și încearcă din nou.`;
}
