import {
  type DocumentSet,
  documentSetGroups,
  documentSetTypeKeys,
  fireDecisionNumber,
  type GenerateDocumentsRequest,
  isDatedDocumentType,
  maxFirstFireDecisionNumber,
  type RegenerateDocumentRequest,
  serviceContractTitle,
  serviceContractTypeKey,
} from '@ssm-usor/contracts';

import type { Json } from '../../database.types';
import { archivedClientError, type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { printedNames } from '../../lib/printed-names';
import { romanianDay } from '../../lib/romanian';
import {
  builtInTemplates,
  merge,
  missingDocumentDataError,
  type Template,
} from '../../lib/templates';
import { buildDocumentContext, decisionNumberOf, documentApplies, documentData } from './context';
import { loadDocumentFacts, loadOwnInstructions, type StoredDocumentFacts } from './facts';
import { buildFireSafetyContext, fireSafetyDocumentData } from './fire-safety';
import { fireFirstDecisionNumber, inSetOrder, presentDocument, presentDocuments } from './present';
import { addRevision } from './revisions';
import {
  type Actor,
  type DocumentRow,
  draftOf,
  lastGeneration,
  newest,
  nextRevision,
  readDocument,
  readDocuments,
  readServiceContractRow,
} from './rows';
import { rulesOf, setOfGroup, setRules, type ThemesRule } from './sets';

/** The year it is in Romania, which the documents are dated by. */
function currentYear() {
  return Number(romanianDay(new Date()).slice(0, 4));
}

/**
 * Documents that exist are left alone: generating one again is asked for one document at a
 * time, because it discards what was edited by hand. Only the set asked for is generated.
 */
export async function generateClientDocuments(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  request: GenerateDocumentsRequest,
  set: DocumentSet = 'occupational_safety'
) {
  const fire = set === 'fire_safety';
  if (
    fire &&
    (request.firstDecisionNumber === undefined ||
      request.firstDecisionNumber > maxFirstFireDecisionNumber)
  ) {
    throw new ApiError('validation_error', 'Say which number the first decision takes.', [
      {
        path: 'firstDecisionNumber',
        message: `Required for the fire-safety set, from 1 to ${maxFirstFireDecisionNumber}.`,
      },
    ]);
  }
  const facts = await loadDocumentFacts(db, clientId, actor, set);
  if (facts.clientArchived) throw archivedClientError();
  const asked = {
    issueDate: request.issueDate,
    firstDecisionNumber: request.firstDecisionNumber ?? 1,
  };
  const period = request.period ?? currentYear();
  const periodOf = (typeKey: string) => (isDatedDocumentType(typeKey) ? period : null);
  const missing = rulesOf(facts, { ...asked, period: null }).missing();
  if (missing.length > 0) throw missingDocumentDataError(missing);

  const [templates, existing] = await Promise.all([
    builtInTemplates(db, documentSetTypeKeys[set]),
    readDocuments(db, clientId, set),
  ]);
  if (templates.length === 0) {
    console.error('No built-in templates are registered: run pnpm templates:register.');
    throw new ApiError('service_unavailable', 'The document templates are not available yet.');
  }
  // A document without a revision is what a failed generation leaves behind: finish it. A dated
  // type's documents of other periods are neither complete nor in the way.
  const ofAskedPeriod = (document: DocumentRow) => document.period === periodOf(document.type_key);
  const complete = new Set(
    existing
      .filter((document) => ofAskedPeriod(document) && document.document_revisions.length > 0)
      .map((d) => d.type_key)
  );
  const wanted = templates.filter(
    (template) => !complete.has(template.typeKey) && documentApplies(facts, template.typeKey)
  );
  if (wanted.length === 0) return { created: [], skipped: [...complete] };

  const generation = await db
    .from('document_generations')
    .insert({
      organization_id: actor.organizationId,
      client_id: clientId,
      document_group: documentSetGroups[set],
      issue_date: request.issueDate,
      first_decision_number: asked.firstDecisionNumber,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (generation.error) throw fromDatabaseError(generation.error, 'create document generation');

  const create = (template: Template, merged: Merged) =>
    createDocument(db, files, actor, clientId, generation.data.id, template, merged, {
      existingId: existing.find(
        (document) => document.type_key === template.typeKey && ofAskedPeriod(document)
      )?.id,
      period: periodOf(template.typeKey),
      set,
    });
  const createdIds: string[] = [];
  let current: StoredDocumentFacts = facts;
  if (facts.set === 'fire_safety') {
    const input = { ...facts, ...asked, period: null };
    const fireMerged =
      (context: ReturnType<typeof buildFireSafetyContext>) => (template: Template) =>
        create(template, {
          data: fireSafetyDocumentData(context, template.typeKey),
          decisionNumber: fireDecisionNumber(template.typeKey, asked.firstDecisionNumber),
        });
    const dated = wanted.filter((template) => isDatedDocumentType(template.typeKey));
    const rule = setRules.fire_safety.themes;
    const themes = wanted.find((template) => template.typeKey === rule.typeKey);
    createdIds.push(
      ...(await inBatches(
        wanted.filter((template) => !dated.includes(template) && template !== themes),
        fireMerged(buildFireSafetyContext(input))
      ))
    );
    if (themes) {
      const merged = await mergeThemes(db, clientId, facts, rule, (reloaded) =>
        fireMerged(buildFireSafetyContext({ ...reloaded, ...asked, period: null }))(themes)
      );
      current = merged.facts;
      createdIds.push(...merged.created);
    }
    // A dated document reports on the set, so it is merged with what this run has just made.
    if (dated.length > 0) {
      const reloaded = await loadDocumentFacts(db, clientId, actor, 'fire_safety', [period]);
      current = reloaded;
      createdIds.push(
        ...(await inBatches(
          dated,
          fireMerged(buildFireSafetyContext({ ...reloaded, ...asked, period }))
        ))
      );
    }
  } else {
    const input = { ...facts, ...asked, period: null };
    const context = buildDocumentContext(input);
    const fromContext = (built: typeof context, typeKey: string): Merged => {
      const decisionNumber = decisionNumberOf(built, typeKey);
      return { data: documentData(built, typeKey, decisionNumber), decisionNumber };
    };
    const rule = setRules.occupational_safety.themes;
    const themes = wanted.find((template) => template.typeKey === rule.typeKey);
    const others = wanted.filter((template) => template !== themes);
    createdIds.push(
      ...(await inBatches(others, (template) =>
        create(template, fromContext(context, template.typeKey))
      ))
    );
    if (themes) {
      const merged = await mergeThemes(db, clientId, facts, rule, (reloaded) =>
        create(
          themes,
          fromContext(buildDocumentContext({ ...reloaded, ...asked, period: null }), themes.typeKey)
        )
      );
      current = merged.facts;
      createdIds.push(...merged.created);
    }
  }

  const documents = await readDocuments(db, clientId, set);
  return {
    created: (
      await presentDocuments(
        db,
        documents.filter((document) => createdIds.includes(document.id)),
        current
      )
    ).sort(inSetOrder(set)),
    skipped: [...complete],
  };
}

/**
 * The themes cite the own instructions revision this same run makes, so they come after the rest,
 * merged with that revision read again. Nothing to cite only when the own instructions are an
 * uploaded file: the themes wait for them to be generated.
 */
async function mergeThemes<Stored extends StoredDocumentFacts>(
  db: DataClient,
  clientId: string,
  facts: Stored,
  rule: ThemesRule<Stored>,
  create: (reloaded: Stored) => Promise<string>
) {
  const reloaded = rule.citing(facts, await loadOwnInstructions(db, clientId, rule.cites));
  return { facts: reloaded, created: rule.cited(reloaded) ? [await create(reloaded)] : [] };
}

// A few at a time: a Worker holds six connections open at once.
async function inBatches<T>(items: T[], run: (item: T) => Promise<string>) {
  const results: string[] = [];
  for (let start = 0; start < items.length; start += 4) {
    results.push(...(await Promise.all(items.slice(start, start + 4).map(run))));
  }
  return results;
}

type Merged = { data: Record<string, unknown>; decisionNumber: number | null };

async function createDocument(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  generationId: string,
  template: Template,
  { data, decisionNumber }: Merged,
  options: { existingId?: string; period: number | null; set: DocumentSet }
) {
  const { bytes, snapshot } = merge(
    await files.readTemplate(template.storagePath),
    data,
    template.typeKey,
    { printing: printedNames(options.set) }
  );

  let documentId = options.existingId;
  if (!documentId) {
    const document = await db
      .from('client_documents')
      .insert({
        organization_id: actor.organizationId,
        client_id: clientId,
        type_key: template.typeKey,
        title: template.title,
        decision_number: decisionNumber,
        period: options.period,
        document_group: documentSetGroups[options.set],
        created_by: actor.createdBy,
      })
      .select('id')
      .single();
    if (document.error) throw fromDatabaseError(document.error, 'create client document');
    documentId = document.data.id;
  }

  // Generation only fills a document that has no revision yet.
  await addRevision(
    db,
    files,
    actor,
    { documentId, clientId, revision: 1 },
    {
      template_version_id: template.versionId,
      generation_id: generationId,
      data_snapshot: snapshot as Json,
    },
    bytes
  );
  return documentId;
}

/**
 * What generating again does to a document: a draft is overwritten in place, hand edits
 * included; beside an issued revision the next one starts as a draft.
 */
async function writeGeneratedDraft(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  document: DocumentRow,
  generated: {
    templateVersionId: string;
    generationId: string | null;
    bytes: Uint8Array;
    snapshot: Record<string, unknown>;
  }
) {
  const { bytes, snapshot, templateVersionId, generationId } = generated;
  const draft = draftOf(document);
  if (draft) {
    await files.writeDocument(draft.docx_path, bytes, { replace: true });
    const updated = await db
      .from('document_revisions')
      .update({
        template_version_id: templateVersionId,
        generation_id: generationId,
        data_snapshot: snapshot as Json,
        // As generated again: nothing of the edit is left.
        edited_at: null,
        edited_by: null,
      })
      .eq('id', draft.id);
    if (updated.error) throw fromDatabaseError(updated.error, 'update document revision');
  } else {
    await addRevision(
      db,
      files,
      actor,
      { documentId: document.id, clientId: document.client_id, revision: nextRevision(document) },
      {
        template_version_id: templateVersionId,
        generation_id: generationId,
        data_snapshot: snapshot as Json,
      },
      bytes
    );
  }
}

/**
 * Generates the service contract (ADR 007) from its built-in template and the data its own
 * module builds, or generates it again. No generation record: what the contract was asked
 * with lives with its module.
 */
export async function generateServiceContractDocument(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  data: Record<string, unknown>
) {
  const [template] = await builtInTemplates(db, [serviceContractTypeKey]);
  if (!template) {
    throw ApiError.conflict(
      'template_missing',
      'This document has no template to be generated from.'
    );
  }
  const { bytes, snapshot } = merge(
    await files.readTemplate(template.storagePath),
    data,
    serviceContractTypeKey
  );
  let document = await readServiceContractRow(db, clientId);
  if (!document) {
    const created = await db
      .from('client_documents')
      .insert({
        organization_id: actor.organizationId,
        client_id: clientId,
        type_key: serviceContractTypeKey,
        title: serviceContractTitle,
        document_group: 'other',
        owners_only: true,
        created_by: actor.createdBy,
      })
      .select('id')
      .single();
    if (created.error) throw fromDatabaseError(created.error, 'create service contract document');
    document = await readDocument(db, created.data.id);
  }
  await writeGeneratedDraft(db, files, actor, document, {
    templateVersionId: template.versionId,
    generationId: null,
    bytes,
    snapshot,
  });
  return presentDocument(db, await readDocument(db, document.id), null);
}

/**
 * A draft is overwritten, hand edits included, which is what the person asked for; an issued
 * document gets a new draft revision and stays as it is until that one is issued.
 */
export async function regenerateDocument(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  request: RegenerateDocumentRequest
) {
  const facts = await regenerateDraft(db, files, actor, documentId, request);
  return presentDocument(db, await readDocument(db, documentId), facts);
}

// The queue's way in: it answers no one with the document, so it skips presenting it. The
// facts it returns are for `regenerateDocument`, which presents the draft with them.
export async function regenerateDraft(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  request: RegenerateDocumentRequest
) {
  const document = await readDocument(db, documentId);
  const set = setOfGroup(document.document_group);
  if (!set) {
    // It would be merged with the facts of a documentation set, which it does not print.
    throw new ApiError('conflict', 'This document is generated from its own page.');
  }
  const facts = await loadDocumentFacts(
    db,
    document.client_id,
    actor,
    set,
    document.period === null ? [] : [document.period]
  );
  if (facts.clientArchived) throw archivedClientError();
  const latest = newest(document);
  const issueDate = request.issueDate ?? latest?.document_generations?.issue_date;
  if (!issueDate) {
    // An uploaded file has no generation to take the date from.
    throw new ApiError('validation_error', 'Say which date the document carries.', [
      { path: 'issueDate', message: 'Required for a document that was not generated before.' },
    ]);
  }
  // The form is filled in again from the set's last generation, so its first number carries over.
  const previous = await lastGeneration(db, document.client_id, set);
  if (previous.error) throw fromDatabaseError(previous.error, 'last document generation');
  const fireFirstNumber =
    set === 'fire_safety'
      ? fireFirstDecisionNumber(
          document,
          latest?.document_generations?.first_decision_number ??
            previous.data?.first_decision_number
        )
      : null;
  const rules = rulesOf(facts, {
    issueDate,
    period: document.period,
    firstDecisionNumber: fireFirstNumber ?? 1,
  });
  const missing = rules.missing(document.type_key);
  const [template] = await builtInTemplates(db, [document.type_key]);
  if (!template) {
    throw new ApiError('conflict', 'This document has no template to be generated from.');
  }
  const data = rules.data(document.type_key, document.decision_number);
  // Gaps elsewhere in the set do not refuse it (ADR 005, amended 2026-10-10).
  const { bytes, snapshot } = merge(
    await files.readTemplate(template.storagePath),
    data,
    document.type_key,
    {
      printedGaps: (absentNames) => missing.filter((code) => rules.concerns(code, absentNames)),
      printing: printedNames(set),
    }
  );

  const generation = await db
    .from('document_generations')
    .insert({
      organization_id: actor.organizationId,
      client_id: document.client_id,
      document_group: documentSetGroups[set],
      issue_date: issueDate,
      first_decision_number:
        set === 'fire_safety' ? fireFirstNumber : (previous.data?.first_decision_number ?? 1),
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (generation.error) throw fromDatabaseError(generation.error, 'create document generation');

  await writeGeneratedDraft(db, files, actor, document, {
    templateVersionId: template.versionId,
    generationId: generation.data.id,
    bytes,
    snapshot,
  });
  return facts;
}
