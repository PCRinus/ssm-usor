import { type SmsRefusalReason, smsRefusalReasons } from '@ssm-usor/contracts';

export type SmsRefusal = { reason: SmsRefusalReason; resumesAt: string | null };

export function smsRefusalOf(
  body: { reason?: string; resumesAt?: string } | null
): SmsRefusal | null {
  const reason = smsRefusalReasons.find((each) => each === body?.reason);
  return reason ? { reason, resumesAt: body?.resumesAt ?? null } : null;
}
