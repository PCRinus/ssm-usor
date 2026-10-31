import { Trans, useLingui } from '@lingui/react/macro';
import type { SmsRefusalReason } from '@ssm-usor/contracts';

import { Notice } from '@/components/notice';
import { romanianDayOf, useFormatDate } from '@/lib/format';

import type { SmsRefusal } from './sms-refusal';

// Only a signer without an email is texted a code, so email is always the way out.
export function SmsRefusalNotice({
  refusal,
  organizationName,
  testId,
  again = false,
}: {
  refusal: SmsRefusal;
  organizationName: string;
  testId: string;
  // Asked for a new code: the one already sent still works until it expires.
  again?: boolean;
}) {
  const { t } = useLingui();
  const formatDate = useFormatDate();
  const resumes = refusal.resumesAt ? formatDate(romanianDayOf(refusal.resumesAt)) : null;

  const why: Record<SmsRefusalReason, string> = {
    sms_trial: t`Codul vine prin SMS, dar ${organizationName} nu trimite încă SMS-uri.`,
    sms_foreign_number: t`Codul vine prin SMS, iar SMS-urile pleacă doar spre numere din România (+40).`,
    sms_allowance_reached: resumes
      ? t`Codul vine prin SMS, iar SMS-urile pentru coduri s-au terminat luna aceasta. Pornesc din nou pe ${resumes}.`
      : t`Codul vine prin SMS, iar SMS-urile pentru coduri s-au terminat luna aceasta.`,
    sms_cap_reached: resumes
      ? t`Codul vine prin SMS, iar SMS-urile sunt oprite până pe ${resumes}.`
      : t`Codul vine prin SMS, iar SMS-urile sunt oprite deocamdată.`,
  };

  return (
    <Notice
      variant="info"
      data-testid={testId}
      data-reason={refusal.reason}
      title={
        again ? (
          <Trans>Nu îți putem trimite un cod nou acum.</Trans>
        ) : (
          <Trans>Nu îți putem trimite codul acum.</Trans>
        )
      }
      className="sm:[&>svg]:translate-y-0.5 sm:[&>svg]:self-start"
    >
      <div className="grid gap-1.5 text-[0.9375rem] leading-relaxed">
        <p>
          {why[refusal.reason]}{' '}
          {refusal.reason === 'sms_trial' ? (
            <Trans>Spune-i specialistului SSM.</Trans>
          ) : (
            <>
              <Trans>Spune-i specialistului SSM de la {organizationName}</Trans>
              {/* "S.R.L." already ends the sentence. */}
              {organizationName.endsWith('.') ? '' : '.'}
            </>
          )}{' '}
          {refusal.reason === 'sms_foreign_number' ? (
            <Trans>
              Dacă îi dai o adresă de email sau un număr din România, codul ajunge la tine și
              semnezi chiar azi.
            </Trans>
          ) : (
            <Trans>Dacă îi dai o adresă de email, codul vine pe email și semnezi chiar azi.</Trans>
          )}
          {refusal.reason === 'sms_cap_reached' && ' '}
          {refusal.reason === 'sms_cap_reached' && (
            <Trans>Poate și ridica limita de SMS-uri, ca să-l primești prin SMS.</Trans>
          )}
        </p>
        {!again && (
          <p className="text-sm opacity-85">
            <Trans>Ce ai bifat rămâne aici și te așteaptă.</Trans>
          </p>
        )}
      </div>
    </Notice>
  );
}
