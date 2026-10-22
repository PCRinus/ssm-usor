import type { SignatureRequestSlot, SignatureSlot, SignerSlot } from '@ssm-usor/contracts';

import type { Signer } from './signers';

export const requestColumns =
  'id, slot, signer_account_id, state, issued_at, notified_at, voided_at, void_reason, created_at';
export const signatureColumns =
  'request_id, slot, method, signer_account_id, signer_name, signer_job_title, signed_at, voided_at, void_reason, created_at';

export type RequestRow = {
  id: string;
  slot: SignatureRequestSlot;
  signer_account_id: string | null;
  state: string;
  issued_at: string;
  notified_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type SignatureRow = {
  request_id: string;
  slot: SignatureRequestSlot;
  method: string;
  signer_account_id: string | null;
  signer_name: string;
  signer_job_title: string | null;
  signed_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

const toIso = (value: string) => new Date(value).toISOString();
const toIsoOrNull = (value: string | null) => (value ? toIso(value) : null);

export const nameIn = (directory: Signer[], accountId: string | null) =>
  accountId
    ? { accountId, name: directory.find((s) => s.accountId === accountId)?.name ?? null }
    : null;

function slotState(
  slot: SignerSlot,
  requests: RequestRow[],
  signatures: SignatureRow[],
  directory: Signer[]
): SignatureSlot {
  const empty: SignatureSlot = {
    slot,
    state: 'unassigned',
    requestId: null,
    signer: null,
    issuedAt: null,
    notifiedAt: null,
    signedAt: null,
    signerName: null,
    signerJobTitle: null,
    voidedAt: null,
    voidReason: null,
  };
  const ofSlot = requests.filter((request) => request.slot === slot);
  const requestOf = (id: string) => ofSlot.find((request) => request.id === id);
  const fromRequest = (request: RequestRow | undefined) =>
    request
      ? {
          requestId: request.id,
          issuedAt: toIso(request.issued_at),
          notifiedAt: toIsoOrNull(request.notified_at),
        }
      : {};
  const signature = signatures.find((row) => row.slot === slot && !row.voided_at);
  if (signature) {
    return {
      ...empty,
      ...fromRequest(requestOf(signature.request_id)),
      requestId: signature.request_id,
      state: signature.method === 'paper' ? 'paper' : 'signed',
      signer: nameIn(directory, signature.signer_account_id),
      signedAt: toIso(signature.signed_at),
      signerName: signature.signer_name,
      signerJobTitle: signature.signer_job_title,
    };
  }
  const pending = ofSlot.find((request) => request.state === 'pending');
  if (pending) {
    return {
      ...empty,
      ...fromRequest(pending),
      state: 'pending',
      signer: nameIn(directory, pending.signer_account_id),
    };
  }
  const voided = ofSlot.find((request) => request.state === 'void');
  if (voided) {
    return {
      ...empty,
      ...fromRequest(voided),
      state: 'void',
      signer: nameIn(directory, voided.signer_account_id),
      voidedAt: toIsoOrNull(voided.voided_at),
      voidReason: voided.void_reason,
    };
  }
  return empty;
}

// The rows must come newest first: a slot shows its newest void request.
export function recordSlots(
  record: { verifierName: string | null; admittedOn: string | null },
  requests: RequestRow[],
  signatures: SignatureRow[],
  directory: Signer[]
): SignatureSlot[] {
  const slots: SignerSlot[] = [
    'trainee',
    'trainer',
    ...(record.verifierName ? (['verifier'] as const) : []),
    ...(record.admittedOn ? (['admitter'] as const) : []),
  ];
  return slots.map((slot) => slotState(slot, requests, signatures, directory));
}
