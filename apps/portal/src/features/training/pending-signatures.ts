import type { SignerSlot } from '@ssm-usor/contracts';

export type PendingSignature = { slot: SignerSlot; signerName: string; mine: boolean };
// By record id: the slots whose request still waits.
export type PendingSignatures = ReadonlyMap<string, PendingSignature[]>;

export function pendingByRecord(
  requests: { slot: SignerSlot; signerName: string; record: { id: string } }[],
  mine: boolean
): PendingSignatures {
  const pending = new Map<string, PendingSignature[]>();
  for (const { slot, signerName, record } of requests) {
    pending.set(record.id, [...(pending.get(record.id) ?? []), { slot, signerName, mine }]);
  }
  return pending;
}
