import {
  samePerson,
  signatureErrorReasons,
  type SignerSlot,
  type TrainingRequest,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Json } from '../../database.types';
import { createAdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { type SmsSender, smsSenderOf } from '../sms-usage/sender';
import { notifySigner } from './notify';
import { placeOf, type Signer, signersOfClient, traineeSignerOf } from './signers';

export type SlotSigners = TrainingRequest['signers'];

/** Null when the save asked for no electronic signature. */
export type SignaturePlan = {
  signers: NonNullable<SlotSigners>;
  directory: Signer[];
} | null;

const assignable = ['trainer', 'verifier', 'admitter'] as const;

const printedName = (body: TrainingRequest, slot: (typeof assignable)[number]) => {
  switch (slot) {
    case 'trainer':
      return body.trainer.name;
    case 'verifier':
      return body.verifier?.name ?? '';
    case 'admitter':
      return body.admission?.name ?? '';
  }
};

/**
 * Checked before the training is saved, so that a signer who cannot sign refuses the save rather
 * than leave a saved training behind a 422: the account must be a member of the organization or
 * a participant of the client, and its own name must be the name the slot prints, in any order,
 * case or diacritics, since the certificate names the account and the sheet the slot's person.
 * The database checks the standing again on insert.
 */
export async function planSignatureRequests(
  db: DataClient,
  clientId: string,
  body: TrainingRequest
): Promise<SignaturePlan> {
  const { signers } = body;
  if (!signers) return null;
  const directory = await signersOfClient(db, clientId);
  const strangers = assignable.filter((slot) => {
    const accountId = signers[slot];
    return accountId && !directory.some((signer) => signer.accountId === accountId);
  });
  if (strangers.length > 0) {
    const message =
      'The signer is neither a member of the organization nor a participant of the client.';
    throw new ApiError(
      'unprocessable',
      message,
      strangers.map((slot) => ({ path: `signers.${slot}`, message })),
      signatureErrorReasons.signerNotOfClient
    );
  }
  const misnamed = assignable.filter((slot) => {
    const accountId = signers[slot];
    if (!accountId) return false;
    const name = printedName(body, slot);
    return !directory.some(
      (signer) => signer.accountId === accountId && samePerson(signer.name, name)
    );
  });
  if (misnamed.length > 0) {
    throw new ApiError(
      'unprocessable',
      'The signer is not the person the slot names.',
      misnamed.map((slot) => ({
        path: `signers.${slot}`,
        message: `The account's name is not ${printedName(body, slot) || 'the name on the slot'}.`,
      })),
      signatureErrorReasons.signerNameMismatch
    );
  }
  return { signers, directory };
}

type IssuedRow = { id: string; slot: SignerSlot; signer_account_id: string | null };

type Replacement = {
  training_record_id: string;
  slot: SignerSlot;
  signer_account_id: string | null;
  replaces: string | null;
  reason: 'signer_changed' | 'paper' | null;
};

async function withdrawnEmployees(db: DataClient, employeeIds: string[]) {
  if (employeeIds.length === 0) return new Set<string>();
  const { data, error } = await db
    .from('employee_signing_agreements')
    .select('employee_id')
    .in('employee_id', employeeIds)
    .eq('state', 'withdrawn');
  if (error) throw fromDatabaseError(error, 'withdrawn signing agreements');
  return new Set(data.map((row) => row.employee_id));
}

// A training typed from paper asks nobody: its signatures are on the paper. A slot whose live
// request is already the one wanted is left alone, so a save after an edit issues only what the
// edit voided; a pending request to someone else gives way, with `signer_changed`, or with
// `paper` when the slot is now left to the pen, in the same transaction as its replacement. A
// signed request is never touched here. No trainee is asked while their agreement is withdrawn.
export async function issueSignatureRequests(
  c: Context<ApiEnv>,
  db: DataClient,
  { clientId, trainingId, plan }: { clientId: string; trainingId: string; plan: SignaturePlan }
) {
  if (!plan) return 0;
  const { data: training, error } = await db
    .from('trainings')
    .select('id, source, verifier_name, training_records(id, employee_id, admitted_on)')
    .eq('id', trainingId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'signature requests training');
  if (!training || training.source === 'paper') return 0;
  const recordIds = training.training_records.map((record) => record.id);
  if (recordIds.length === 0) return 0;

  const [live, withdrawn] = await Promise.all([
    db
      .from('signature_requests')
      .select('id, training_record_id, slot, state, signer_account_id')
      .in('training_record_id', recordIds)
      .neq('state', 'void'),
    withdrawnEmployees(
      db,
      training.training_records.map((record) => record.employee_id)
    ),
  ]);
  if (live.error) throw fromDatabaseError(live.error, 'live signature requests');
  const liveOf = new Map(live.data.map((row) => [`${row.training_record_id}:${row.slot}`, row]));

  const { signers, directory } = plan;
  const wanted = training.training_records.flatMap((record) =>
    (
      [
        [
          'trainee',
          withdrawn.has(record.employee_id)
            ? null
            : traineeSignerOf(directory, record.employee_id)?.accountId,
        ],
        ['trainer', signers.trainer],
        ['verifier', training.verifier_name ? signers.verifier : null],
        ['admitter', record.admitted_on ? signers.admitter : null],
      ] as [SignerSlot, string | null | undefined][]
    ).map(([slot, accountId]) => ({ record, slot, accountId: accountId ?? null }))
  );

  const replacements: Replacement[] = [];
  for (const { record, slot, accountId } of wanted) {
    const current = liveOf.get(`${record.id}:${slot}`);
    if (current && (current.state !== 'pending' || current.signer_account_id === accountId)) {
      continue;
    }
    if (!current && !accountId) continue;
    replacements.push({
      training_record_id: record.id,
      slot,
      signer_account_id: accountId,
      replaces: current?.id ?? null,
      reason: current ? (accountId ? 'signer_changed' : 'paper') : null,
    });
  }
  if (replacements.length === 0) return 0;

  const issued = await db.rpc('issue_signature_requests', {
    p_requests: replacements as unknown as Json,
  });
  if (issued.error) throw fromDatabaseError(issued.error, 'issue signature requests');
  const rows: IssuedRow[] = issued.data.map((row) => ({
    id: row.id,
    slot: row.slot as SignerSlot,
    signer_account_id: row.signer_account_id,
  }));

  await notifySigners(c, db, directory, rows);
  return rows.length;
}

// Best effort: the requests stand without the message, the member sees them unsigned, and a
// request without `notified_at` is one whose signer was not told.
async function notifySigners(
  c: Context<ApiEnv>,
  db: DataClient,
  directory: Signer[],
  issued: IssuedRow[]
) {
  const groups = new Map<string, { signer: Signer; place: 'portal' | 'app'; ids: string[] }>();
  for (const request of issued) {
    if (!request.signer_account_id) continue;
    const found = placeOf(directory, request.signer_account_id, request.slot === 'trainee');
    if (!found?.signer.contact) continue;
    const key = `${found.place}:${request.signer_account_id}`;
    const group = groups.get(key) ?? { signer: found.signer, place: found.place, ids: [] };
    group.ids.push(request.id);
    groups.set(key, group);
  }
  if (groups.size === 0) return;

  const organization = await db
    .from('organizations')
    .select('name')
    .eq('id', c.get('membership').organizationId)
    .maybeSingle();
  if (organization.error || !organization.data) {
    console.error('Signature requests not notified: the organization could not be read.');
    return;
  }

  const notified: string[] = [];
  let sms: SmsSender | null = null;
  for (const { signer, place, ids } of groups.values()) {
    try {
      sms ??= smsSenderOf(c);
      const outcome = await notifySigner(
        { env: c.env, sms },
        { contact: signer.contact!, place },
        {
          count: ids.length,
          organizationId: c.get('membership').organizationId,
          organizationName: organization.data.name,
        }
      );
      if (outcome.sent) notified.push(...ids);
      else console.warn(`Signature request SMS skipped: ${outcome.reason}`);
    } catch (error) {
      console.error(
        `Signature request ${signer.contact!.channel} failed: ${error instanceof Error ? error.name : 'unknown'}`
      );
    }
  }
  if (notified.length === 0) return;

  // Members may insert requests but not change them; notified_at is the API's to set.
  try {
    const { error } = await createAdminClient(c)
      .from('signature_requests')
      .update({ notified_at: new Date().toISOString() })
      .in('id', notified);
    if (error) console.error(`Signature requests notified_at failed: ${error.code ?? 'no code'}`);
  } catch {
    console.error('Signature requests notified_at failed: no secret key.');
  }
}
