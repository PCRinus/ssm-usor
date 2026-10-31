import { countryOf, isRomanianNumber } from '@ssm-usor/contracts';

import { useMe } from '@/features/account/use-me';

/** A trial without a chosen plan sends no SMS of any kind (ADR 029). */
export function useSmsOff() {
  return useMe().data?.smsThisMonth?.state === 'none';
}

export type SmsBlock = 'trial' | 'foreign';

export function smsBlockOf(phone: string, smsOff: boolean): SmsBlock | null {
  if (smsOff) return 'trial';
  return isRomanianNumber(phone) ? null : 'foreign';
}

export const smsBlockLabels: Record<SmsBlock, string> = {
  trial: 'SMS, după ce alegi un plan',
  foreign: 'SMS doar spre numere din România',
};

export const romanianOnlyHint = 'SMS trimitem doar spre numere din România (+40).';

export const trialSmsNotice =
  'În perioada de probă nu trimitem SMS. Invitația și codurile de semnare pleacă pe email; SMS-urile pornesc când alegi un plan.';

const regions = new Intl.DisplayNames(['ro'], { type: 'region' });

export function foreignNumberLabel(phone: string) {
  const country = countryOf(phone);
  const name = country ? regions.of(country) : undefined;
  return name ? `un număr din ${name}` : 'un număr din afara României';
}
