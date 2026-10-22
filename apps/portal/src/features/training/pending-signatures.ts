import type { SignatureRequestSlot } from '@ssm-usor/contracts';

export type PendingSignature = { slot: SignatureRequestSlot; signerName: string; mine: boolean };
// By record id: the slots whose request still waits.
export type PendingSignatures = ReadonlyMap<string, PendingSignature[]>;

export function pendingByRecord(
  requests: { slot: SignatureRequestSlot; signerName: string; record: { id: string } | null }[],
  mine: boolean
): PendingSignatures {
  const pending = new Map<string, PendingSignature[]>();
  for (const { slot, signerName, record } of requests) {
    if (!record) continue;
    pending.set(record.id, [...(pending.get(record.id) ?? []), { slot, signerName, mine }]);
  }
  return pending;
}
