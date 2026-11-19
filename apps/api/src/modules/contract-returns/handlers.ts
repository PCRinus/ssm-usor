import type { RouteHandler } from '@hono/zod-openapi';
import {
  contractReturnConflictReasons,
  type ContractReturnResponse,
  type ContractReturnStatus,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { type ApiEnv, appOrigin } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore } from '../../lib/files';
import { hashToken } from '../../lib/tokens';
import { recordSignedCopy } from '../documents/revisions';
import { contractFileName } from '../service-contracts/context';
import type {
  downloadContractReturnRoute,
  lookupContractReturnRoute,
  uploadContractReturnRoute,
} from './routes';

const maxUploads = 20;
const maxBytes = 15 * 1024 * 1024;
const pdfSignature = new TextEncoder().encode('%PDF-');

// Everything the send points at, one step at a time: the embeds between these tables need
// their relationship names, and a wrong one is only found against a real database.
async function findSend(c: Context<ApiEnv>, token: string) {
  const admin = createAdminClient(c);
  const send = await admin
    .from('service_contract_sends')
    .select(
      'id, document_id, revision_id, organization_id, sent_by, return_expires_at, return_uploads'
    )
    .eq('token_hash', await hashToken(token))
    .maybeSingle();
  if (send.error) throw fromDatabaseError(send.error, 'find send by token');
  if (!send.data) throw new ApiError('not_found', 'No contract was sent with this link.');

  const [revision, document, organization] = await Promise.all([
    admin
      .from('document_revisions')
      .select(
        'id, revision, status, docx_path, pdf_path, document_signed_copies(source, confirmed_at, uploaded_at)'
      )
      .eq('id', send.data.revision_id)
      .single(),
    admin
      .from('client_documents')
      .select('id, client_id, title')
      .eq('id', send.data.document_id)
      .single(),
    admin
      .from('organizations')
      .select('name, legal_name')
      .eq('id', send.data.organization_id)
      .single(),
  ]);
  if (revision.error) throw fromDatabaseError(revision.error, 'revision of the sent contract');
  if (document.error) throw fromDatabaseError(document.error, 'document of the sent contract');
  if (organization.error) {
    throw fromDatabaseError(organization.error, 'organization of the sent contract');
  }
  const [client, contract] = await Promise.all([
    admin
      .from('clients')
      .select('id, legal_name, stage, archived_at')
      .eq('id', document.data.client_id)
      .single(),
    admin
      .from('service_contracts')
      .select('contract_number, contract_date')
      .eq('client_id', document.data.client_id)
      .single(),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'client of the sent contract');
  if (contract.error) throw fromDatabaseError(contract.error, 'details of the sent contract');

  const copy = revision.data.document_signed_copies;
  const expired =
    send.data.return_expires_at !== null && new Date(send.data.return_expires_at) <= new Date();
  const status: ContractReturnStatus = copy?.confirmed_at
    ? 'confirmed'
    : revision.data.status !== 'issued'
      ? 'superseded'
      : expired || client.data.archived_at
        ? 'expired'
        : copy
          ? 'received'
          : 'open';

  return {
    admin,
    send: send.data,
    revision: revision.data,
    document: document.data,
    client: client.data,
    contract: contract.data,
    organizationName: organization.data.legal_name ?? organization.data.name,
    status,
  };
}

type Found = Awaited<ReturnType<typeof findSend>>;

async function senderEmail(admin: AdminClient, userId: string | null) {
  if (!userId) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function respond(found: Found): Promise<ContractReturnResponse> {
  const copy = found.revision.document_signed_copies;
  return {
    status: found.status,
    organizationName: found.organizationName,
    clientName: found.client.legal_name,
    contractNumber: found.contract.contract_number,
    contractDate: found.contract.contract_date,
    revision: found.revision.revision,
    contactEmail: await senderEmail(found.admin, found.send.sent_by),
    receivedAt: found.status === 'received' && copy ? copy.uploaded_at : null,
  };
}

const closed = () =>
  ApiError.conflict(
    contractReturnConflictReasons.closed,
    'This link no longer takes a signed copy.'
  );

export const lookupContractReturn: RouteHandler<typeof lookupContractReturnRoute, ApiEnv> = async (
  c
) => {
  const found = await findSend(c, c.req.valid('json').token);
  return c.json(await respond(found), 200);
};

export const downloadContractReturn: RouteHandler<
  typeof downloadContractReturnRoute,
  ApiEnv
> = async (c) => {
  const found = await findSend(c, c.req.valid('json').token);
  if (found.status !== 'open' && found.status !== 'received') throw closed();
  // Sent, so it has one; a revision issued without a PDF is refused at sending.
  if (!found.revision.pdf_path) throw closed();
  // The page keeps a link ready on a real button and renews it; a phone may leave it asleep
  // for a while.
  const expiresInSeconds = 600;
  const fileName = contractFileName(found.contract.contract_number, found.contract.contract_date);
  const url = await createAdminFileStore(c).documentLink(found.revision.pdf_path, expiresInSeconds);
  return c.json({ url, fileName, expiresInSeconds }, 200);
};

export const uploadContractReturn: RouteHandler<typeof uploadContractReturnRoute, ApiEnv> = async (
  c
) => {
  const { token, file } = c.req.valid('form');
  const found = await findSend(c, token);
  if (found.status !== 'open' && found.status !== 'received') throw closed();
  if (found.send.return_uploads >= maxUploads) {
    throw ApiError.conflict(
      contractReturnConflictReasons.tooManyUploads,
      'This link has taken as many files as it will.'
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new ApiError('validation_error', 'The file is empty or larger than 15 MB.');
  }
  if (!pdfSignature.every((byte, index) => bytes[index] === byte)) {
    throw new ApiError('validation_error', 'The signed copy is a PDF.');
  }

  const { admin, send, revision } = found;
  // The counter goes up before the file so that a failing upload still counts as a try.
  const counted = await admin
    .from('service_contract_sends')
    .update({ return_uploads: send.return_uploads + 1 })
    .eq('id', send.id);
  if (counted.error) throw fromDatabaseError(counted.error, 'count return upload');
  const uploadedAt = await recordSignedCopy(admin, createAdminFileStore(c), {
    revision: {
      id: revision.id,
      docxPath: revision.docx_path,
      hasCopy: Boolean(revision.document_signed_copies),
    },
    documentId: send.document_id,
    organizationId: send.organization_id,
    bytes,
    uploadedBy: null,
    source: 'client',
    context: 'record received copy',
  });

  // The owner hears of it; a copy that arrived is not lost when the email is.
  const to = await senderEmail(admin, send.sent_by);
  if (to && c.env.MAIL) {
    // A contract can be drafted for a client too, whose contract has a tab of its own.
    const page =
      found.client.stage === 'client'
        ? `/clienti/${found.client.id}/contract`
        : `/oferte/${found.client.id}`;
    const leadUrl = new URL(page, appOrigin(c.env)).href;
    try {
      await c.env.MAIL.sendSignedCopyReceived({
        to,
        clientName: found.client.legal_name,
        contractNumber: found.contract.contract_number,
        contractDate: found.contract.contract_date,
        leadUrl,
      });
    } catch (cause) {
      console.error(`The owner could not be told of a received copy: ${String(cause)}`);
    }
  }

  return c.json(
    await respond({
      ...found,
      status: 'received',
      revision: {
        ...revision,
        document_signed_copies: { source: 'client', confirmed_at: null, uploaded_at: uploadedAt },
      },
    }),
    200
  );
};
