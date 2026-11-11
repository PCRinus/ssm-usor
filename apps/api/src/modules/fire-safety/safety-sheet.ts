import type { RouteHandler } from '@hono/zod-openapi';
import {
  clientConflictReasons,
  type CreditsShort,
  extractionRefusalOf,
  importCredits,
  importErrorReasons,
  type PdfText,
  safetySheetErrorReasons,
  safetySheetLimits,
} from '@ssm-usor/contracts';
import {
  type Completion,
  createModelClient,
  GatewayError,
  hasSafetySheetStructure,
  ModelAnswerError,
  noUsage,
  readSafetySheetAnswer,
  type SafetySheetAnswer,
  safetySheetModel,
  safetySheetRequest,
  SafetySheetTooLongError,
  type Usage,
} from '@ssm-usor/import';

import { createLastingAdminClient } from '../../lib/admin-db';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createExtractor } from '../../lib/extractor';
import { creditsStore } from '../credits/store';
import { safetySheetCharges } from '../credits/usage';
import type { readSafetySheetRoute } from './routes';

const refused = (reason: string, message: string) =>
  new ApiError('unprocessable', message, undefined, reason);

const failed = (message: string) =>
  new ApiError('service_unavailable', message, undefined, safetySheetErrorReasons.failed);

const creditsShort = (short: CreditsShort) =>
  new ApiError(
    'conflict',
    `Reading a safety data sheet needs ${short.needed} credits, and ${short.left} are left.`,
    undefined,
    importErrorReasons.creditsInsufficient,
    undefined,
    { credits: short }
  );

// The member waits on the dialog for the answer, so an attempt that hangs is cut well before the
// import's ten minutes; the gateway client still tries a failed one again.
const attemptMilliseconds = 120_000;

function sheetModel(env: ApiEnv['Bindings']) {
  const baseUrl = env.AI_GATEWAY_URL?.trim();
  const token = env.AI_GATEWAY_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return createModelClient({ baseUrl, token, timeoutMilliseconds: attemptMilliseconds });
}

const isPdf = (bytes: Uint8Array) =>
  bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';

async function writableClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, archived_at, stage')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw new ApiError('not_found', 'This client does not exist in your organization.');
  if (data.archived_at) {
    throw new ApiError('conflict', undefined, undefined, clientConflictReasons.clientArchived);
  }
  if (data.stage === 'lead') {
    throw new ApiError('conflict', undefined, undefined, clientConflictReasons.clientIsLead);
  }
}

const tooLarge = () =>
  refused(safetySheetErrorReasons.tooLarge, 'The file is larger than a safety data sheet may be.');

async function sheetText(pdf: () => Promise<PdfText>) {
  let read: PdfText;
  try {
    read = await pdf();
  } catch (error) {
    const refusal = extractionRefusalOf(error);
    if (refusal === 'too_large') throw tooLarge();
    if (refusal === 'corrupt' || refusal === 'password_protected' || refusal === 'unsupported') {
      throw refused(safetySheetErrorReasons.unreadable, `The PDF cannot be read (${refusal}).`);
    }
    throw failed('The text of the file could not be taken out.');
  }
  if (read.pageCount > safetySheetLimits.maxPages) {
    throw refused(
      safetySheetErrorReasons.tooManyPages,
      `The PDF has ${read.pageCount} pages, more than ${safetySheetLimits.maxPages}.`
    );
  }
  const scanned = read.pages.filter((page) => page.isScan).length;
  if (scanned * 2 > read.pageCount || read.pageCount === 0) {
    throw refused(safetySheetErrorReasons.scanned, 'The PDF has no text layer on most pages.');
  }
  return read.pages
    .filter((page) => !page.isScan)
    .map((page) => page.text)
    .join('\n\n');
}

const notASheet = () =>
  refused(safetySheetErrorReasons.notASheet, 'The file is not a safety data sheet.');

function logUsage(fields: {
  organizationId: string;
  clientId: string;
  usage: Usage;
  cost: number;
  outcome: string;
  droppedCodes?: number;
}) {
  console.log(
    JSON.stringify({ event: 'safety_sheet_reading', model: safetySheetModel, ...fields })
  );
}

export const readSafetySheet: RouteHandler<typeof readSafetySheetRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const model = sheetModel(c.env);
  const extractor = createExtractor(c.env);
  if (!model || !extractor) {
    throw new ApiError(
      'service_unavailable',
      'Reading safety data sheets is not configured.',
      undefined,
      safetySheetErrorReasons.unavailable
    );
  }
  if (Number(c.req.header('Content-Length') ?? 0) > safetySheetLimits.maxBytes) throw tooLarge();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > safetySheetLimits.maxBytes) throw tooLarge();
  if (!isPdf(bytes)) throw refused(safetySheetErrorReasons.notPdf, 'The file is not a PDF.');
  await writableClient(createDataClient(c), clientId);

  const organizationId = c.get('membership').organizationId;
  // The refund must land even when the member closes the dialog while the model reads.
  const charges = safetySheetCharges(creditsStore(createLastingAdminClient(c)));
  const key = `sheet:${crypto.randomUUID()}`;
  const charge = await charges.charge(organizationId, key);
  if (!charge.started) throw creditsShort(charge.short);

  let spent: { usage: Usage; cost: number } = { usage: noUsage, cost: 0 };
  try {
    const text = await sheetText(() => extractor.pdfText(bytes.slice().buffer));
    if (!hasSafetySheetStructure(text)) throw notASheet();
    let completion: Completion<SafetySheetAnswer>;
    try {
      completion = await model.complete({
        ...safetySheetRequest(text),
        metadata: { organizationId, reading: 'safety_sheet', clientId },
      });
    } catch (error) {
      if (error instanceof SafetySheetTooLongError) throw tooLarge();
      if (error instanceof GatewayError || error instanceof ModelAnswerError) {
        spent = { usage: error.usage, cost: error.cost };
        console.error(`Safety data sheet reading failed: ${error.message}`);
        throw failed('The safety data sheet could not be read.');
      }
      throw error;
    }
    spent = { usage: completion.usage, cost: completion.cost };
    const reading = readSafetySheetAnswer(completion.value, text);
    if (reading.kind === 'not_a_sheet') throw notASheet();
    logUsage({
      organizationId,
      clientId,
      ...spent,
      outcome: 'draft',
      droppedCodes: reading.droppedCodes,
    });
    return c.json(
      {
        draft: reading.draft,
        droppedCodes: reading.droppedCodes,
        credits: importCredits.safetySheet,
      },
      200
    );
  } catch (error) {
    await charges
      .refund(key)
      .catch((refund: unknown) =>
        console.error(
          `Credits of safety sheet reading ${key} were not given back: ${refund instanceof Error ? refund.message : String(refund)}`
        )
      );
    const reason = error instanceof ApiError ? (error.reason ?? error.code) : 'error';
    if (spent.cost > 0) logUsage({ organizationId, clientId, ...spent, outcome: reason });
    throw error;
  }
};
