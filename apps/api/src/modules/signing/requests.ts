import { signatureErrorReasons, type SignerSlot, type TrainingRequest } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { notifySigner } from './notify';
import { placeOf, type Signer, signersOfClient, traineeSignerOf } from './signers';

export type SlotSigners = TrainingRequest['signers'];

/** Null when the save asked for no electronic signature. */
export type SignaturePlan = {
  signers: NonNullable<SlotSigners>;
  directory: Signer[];
} | null;

const assignable = ['trainer', 'verifier', 'admitter'] as const;

/**
 * Checked before the training is saved, so that a signer who cannot sign refuses the save rather
 * than leave a saved training behind a 422. The database checks again on insert.
 */
export async function planSignatureRequests(
  db: DataClient,
  clientId: string,
  signers: SlotSigners
): Promise<SignaturePlan> {
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
  return { signers, directory };
}

type IssuedRow = { id: string; slot: SignerSlot; signer_account_id: string | null };

// A training typed from paper asks nobody: its signatures are on the paper. A slot whose live
// request is already the one wanted is left alone, so a save after an edit issues only what the
// edit voided; a pending request to someone else gives way, with `signer_changed`, or with
// `paper` when the slot is now left to the pen. A signed request is never touched here.
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

  const live = await db
    .from('signature_requests')
    .select('id, training_record_id, slot, state, signer_account_id')
    .in('training_record_id', recordIds)
    .neq('state', 'void');
  if (live.error) throw fromDatabaseError(live.error, 'live signature requests');
  const liveOf = new Map(live.data.map((row) => [`${row.training_record_id}:${row.slot}`, row]));

  const { signers, directory } = plan;
  const wanted = training.training_records.flatMap((record) =>
    (
      [
        ['trainee', traineeSignerOf(directory, record.employee_id)?.accountId],
        ['trainer', signers.trainer],
        ['verifier', training.verifier_name ? signers.verifier : null],
        ['admitter', record.admitted_on ? signers.admitter : null],
      ] as [SignerSlot, string | null | undefined][]
    ).map(([slot, accountId]) => ({ record, slot, accountId: accountId ?? null }))
  );

  const replaced = { signer_changed: [] as string[], paper: [] as string[] };
  for (const { record, slot, accountId } of wanted) {
    const current = liveOf.get(`${record.id}:${slot}`);
    if (current?.state !== 'pending' || current.signer_account_id === accountId) continue;
    replaced[accountId ? 'signer_changed' : 'paper'].push(current.id);
    liveOf.delete(`${record.id}:${slot}`);
  }
  await voidPending(c, replaced);

  const rows = wanted.flatMap(({ record, slot, accountId }) =>
    accountId && !liveOf.has(`${record.id}:${slot}`)
      ? [
          {
            organization_id: c.get('membership').organizationId,
            client_id: clientId,
            training_record_id: record.id,
            slot,
            signer_account_id: accountId,
          },
        ]
      : []
  );
  if (rows.length === 0) return 0;

  const inserted = await db
    .from('signature_requests')
    .insert(rows)
    .select('id, slot, signer_account_id');
  if (inserted.error) throw fromDatabaseError(inserted.error, 'issue signature requests');

  await notifySigners(c, db, directory, inserted.data);
  return inserted.data.length;
}

// Members may insert requests but not change them.
async function voidPending(
  c: Context<ApiEnv>,
  byReason: Record<'signer_changed' | 'paper', string[]>
) {
  for (const [reason, ids] of Object.entries(byReason)) {
    if (ids.length === 0) continue;
    const { error } = await createAdminClient(c)
      .from('signature_requests')
      .update({ state: 'void', voided_at: new Date().toISOString(), void_reason: reason })
      .in('id', ids)
      .eq('state', 'pending');
    if (error) throw fromDatabaseError(error, 'void replaced signature requests');
  }
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
  for (const { signer, place, ids } of groups.values()) {
    try {
      await notifySigner(
        c.env,
        { contact: signer.contact!, place },
        { count: ids.length, organizationName: organization.data.name }
      );
      notified.push(...ids);
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
