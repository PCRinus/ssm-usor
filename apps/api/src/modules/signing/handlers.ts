import type { RouteHandler } from '@hono/zod-openapi';
import type { RecordSignaturesResponse } from '@ssm-usor/contracts';

import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { signedSheetContext, voidRow } from '../signed-sheets/signed-sheets';
import {
  recordSlots,
  requestColumns,
  type RequestRow,
  signatureColumns,
  type SignatureRow,
} from './record-slots';
import { findClient } from './request-lists';
import type {
  getRecordSignaturesRoute,
  listSignerCandidatesRoute,
  markPaperSignatureRoute,
  voidRecordSignaturesRoute,
} from './routes';
import { signersOfClient } from './signers';

const noSuchRecord = () =>
  new ApiError('not_found', 'This training record does not exist under this client.');

export const listSignerCandidates: RouteHandler<typeof listSignerCandidatesRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const seen = new Set<string>();
  const items = (await signersOfClient(db, clientId)).flatMap(
    ({ accountId, name, jobTitle, kind, employeeId }) => {
      if (seen.has(accountId)) return [];
      seen.add(accountId);
      return [{ accountId, name, jobTitle, kind, employeeId }];
    }
  );
  return c.json({ items }, 200);
};

async function recordSignatures(
  db: DataClient,
  clientId: string,
  recordId: string
): Promise<RecordSignaturesResponse> {
  const [record, requests, signatures] = await Promise.all([
    db
      .from('training_records')
      .select('id, admitted_on, trainings!inner(verifier_name)')
      .eq('id', recordId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('signature_requests')
      .select(requestColumns)
      .eq('training_record_id', recordId)
      .order('created_at', { ascending: false }),
    db
      .from('training_signatures')
      .select(signatureColumns)
      .eq('training_record_id', recordId)
      .order('created_at', { ascending: false }),
  ]);
  if (record.error) throw fromDatabaseError(record.error, 'signatures record');
  if (requests.error) throw fromDatabaseError(requests.error, 'record signature requests');
  if (signatures.error) throw fromDatabaseError(signatures.error, 'record signatures');
  if (!record.data) throw noSuchRecord();
  const requestRows = requests.data as RequestRow[];
  const signatureRows = signatures.data as SignatureRow[];
  const named =
    requestRows.some((row) => row.signer_account_id) ||
    signatureRows.some((row) => row.signer_account_id);
  const directory = named ? await signersOfClient(db, clientId) : [];
  return {
    recordId,
    slots: recordSlots(
      {
        verifierName: record.data.trainings.verifier_name,
        admittedOn: record.data.admitted_on,
      },
      requestRows,
      signatureRows,
      directory
    ),
    hasSignatures: signatureRows.length > 0,
  };
}

// The functions find the record in the caller's organization; the client in the path is checked
// here, so a record of another client is a 404 as everywhere else.
async function requireRecord(db: DataClient, clientId: string, recordId: string) {
  const { data, error } = await db
    .from('training_records')
    .select('id')
    .eq('id', recordId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'signing record');
  if (!data) throw noSuchRecord();
}

function fromSigningFunctionError(
  error: { code?: string | null; message?: string },
  context: string
) {
  if (error.code === 'P0002') return noSuchRecord();
  return fromDatabaseError(error, context);
}

export const getRecordSignatures: RouteHandler<typeof getRecordSignaturesRoute, ApiEnv> = async (
  c
) => {
  const { clientId, recordId } = c.req.valid('param');
  return c.json(await recordSignatures(createDataClient(c), clientId, recordId), 200);
};

export const markPaperSignature: RouteHandler<typeof markPaperSignatureRoute, ApiEnv> = async (
  c
) => {
  const { clientId, recordId } = c.req.valid('param');
  const { slot, signerName, signerJobTitle } = c.req.valid('json');
  const db = createDataClient(c);
  await requireRecord(db, clientId, recordId);
  const { error } = await db.rpc('mark_paper_signature', {
    p_record_id: recordId,
    p_slot: slot,
    p_signer_name: signerName,
    p_signer_job_title: signerJobTitle ?? undefined,
  });
  if (error) throw fromSigningFunctionError(error, 'mark paper signature');
  return c.json(await recordSignatures(db, clientId, recordId), 200);
};

export const voidRecordSignatures: RouteHandler<typeof voidRecordSignaturesRoute, ApiEnv> = async (
  c
) => {
  const { clientId, recordId } = c.req.valid('param');
  const { reason } = c.req.valid('json');
  const db = createDataClient(c);
  await requireRecord(db, clientId, recordId);
  const { error } = await db.rpc('void_training_signatures', {
    p_record_id: recordId,
    p_reason: reason,
  });
  if (error) throw fromSigningFunctionError(error, 'void training signatures');
  // The database has voided the row; the sheet's "anulat" follows here or on its next write.
  try {
    await voidRow(signedSheetContext(c), recordId);
  } catch (failure) {
    if (!(failure instanceof ApiError && failure.reason === 'record_not_on_sheet')) {
      console.error(
        `The voided row of ${recordId} was not marked on its sheet: ${failure instanceof ApiError ? (failure.reason ?? failure.code) : failure instanceof Error ? failure.name : 'unknown'}`
      );
    }
  }
  return c.json(await recordSignatures(db, clientId, recordId), 200);
};
