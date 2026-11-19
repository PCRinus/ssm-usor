import {
  type CompanyLookup,
  type ImportLibraryPart,
  importLibraryParts,
  type InstructionDomain,
  instructionsPartDomains,
  isInstructionsPart,
} from '@ssm-usor/contracts';
import {
  type FileTriage,
  libraryFiles,
  lookUpRegistrations,
  proposalSchema,
  type Reading,
  readingAnswer,
  readingMessages,
  readingModel,
  setAsideKinds,
  sortFiles,
  sortingAnswer,
  sortingMessages,
  sortingModel,
  toProposal,
  withChecks,
} from '@ssm-usor/import';

import type { ImportMessage } from '../../lib/env';
import { alertImport } from './import-alerts';
import type { RegisteredCompany } from './payload';
import {
  ask,
  characterCount,
  fileReasons,
  type FileToRead,
  identityOf,
  ImportFailure,
  importReasons,
  maxReadWaits,
  type PipelineDeps,
  readingCapBreach,
  readingOutputTokens,
  readPollSeconds,
  requireQueue,
  sortingOutputTokens,
  transition,
} from './pipeline';
import {
  fileToRead,
  folderOf,
  isImage,
  isLibraryFile,
  isRiskFile,
  loadPrepared,
  pageLabel,
  pageReadingName,
  setAsideReason,
  sortedStates,
} from './pipeline-files';
import { clientReadingFlags } from './reading-flags';
import { checkSheets, keepSheets } from './sheet-steps';
import { asJson, type ImportFileRow, type ImportFileUpdate } from './store';

export function libraryPartsOf(files: ImportFileRow[]): ImportLibraryPart[] {
  const domains = new Set(
    files
      .filter((file) => isLibraryFile(file) && file.document_kind === 'own_instructions')
      .map((file) => file.document_domain)
  );
  return importLibraryParts.filter((part) =>
    part === 'risk_evaluations'
      ? files.some(isRiskFile)
      : domains.has(instructionsPartDomains[part])
  );
}

function fileCompany(triage: FileTriage | undefined) {
  const name = triage?.companyName?.trim().slice(0, 200) || null;
  const cui = triage?.companyCui?.replace(/\D/g, '') ?? '';
  return { company_name: name, company_cui: /^[1-9][0-9]{1,9}$/.test(cui) ? cui : null };
}

export async function sortImport(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'sorting') return;
  if (row.kind === 'employees') {
    await keepSheets(deps, row);
    return;
  }
  // Every file past preparing: a delivery that is retried sorts again what an earlier one began.
  const sortable = (await deps.store.listFiles(importId)).filter((file) =>
    sortedStates.has(file.state)
  );
  if (sortable.length === 0) throw new ImportFailure(importReasons.nothingPrepared);
  const loaded = await Promise.all(sortable.map((file) => loadPrepared(deps.objects, file)));
  const { provider, client } = await identityOf(deps, row);

  const textual = loaded.filter((entry) => entry.text.trim() !== '');
  const triages = new Map<string, FileTriage>();
  if (textual.length > 0) {
    const answer = await ask(deps, row, null, 'sorting', {
      model: sortingModel,
      messages: sortingMessages({
        provider,
        files: textual.map((entry) => ({ path: entry.file.upload_path, text: entry.text })),
      }),
      answer: sortingAnswer,
      reasoningEffort: 'low',
      maxCompletionTokens: sortingOutputTokens,
    });
    for (const triage of answer.files) triages.set(triage.path, triage);
  }
  const sorting = sortFiles(
    loaded.map((entry) => ({
      path: entry.file.upload_path,
      triage: triages.get(entry.file.upload_path) ?? null,
    })),
    { provider: { name: provider.name, cui: provider.cui || null }, client }
  );

  const byPath = new Map(loaded.map((entry) => [entry.file.upload_path, entry]));
  const domainOf = new Map<string, InstructionDomain>();
  for (const [domain, parts] of Object.entries(libraryFiles(sorting, triages))) {
    for (const path of [...parts.instructions, ...parts.themes]) {
      domainOf.set(path, domain as InstructionDomain);
    }
  }
  const kept: FileToRead[] = [];
  const scans: string[] = [];
  for (const outcome of sorting.files) {
    const entry = byPath.get(outcome.path)!;
    const triage = triages.get(outcome.path);
    const patch: ImportFileUpdate = {
      ...fileCompany(triage),
      document_kind: triage?.kind ?? null,
      document_domain: domainOf.get(outcome.path) ?? null,
      reason: null,
    };
    if (outcome.outcome === 'read') {
      const read = fileToRead(entry);
      kept.push(read);
      if (read.scannedPages > 0) scans.push(entry.file.id);
      patch.state = read.scannedPages > 0 ? 'prepared' : 'read';
    } else if (outcome.outcome === 'set_aside') {
      patch.state = 'set_aside';
      patch.reason =
        triage?.carriesClientData === false && !setAsideKinds.includes(outcome.kind)
          ? fileReasons.noClientData
          : setAsideReason(outcome.kind);
    } else if (outcome.outcome === 'employee_import') {
      patch.state = 'for_employees';
      patch.reason = fileReasons.trainingSheet;
    } else {
      const company = outcome.company;
      patch.state = 'other_company';
      patch.company_name = company.name?.slice(0, 200) ?? patch.company_name;
      patch.company_cui = company.cui ?? patch.company_cui;
      patch.reason = `Este despre altă firmă: ${company.name ?? `CUI ${company.cui}`}.`.slice(
        0,
        1000
      );
    }
    await deps.store.updateFile(entry.file.id, patch);
  }
  await deps.store.advance(importId, 'sorting', { read_characters: characterCount(kept) });
  if (kept.length === 0) throw new ImportFailure(importReasons.nothingToRead);
  const breach = readingCapBreach(kept, row.kind);
  if (breach) {
    throw new ImportFailure(
      breach.cap === 'text' ? breach.reason : importReasons.tooManyScans[row.kind]
    );
  }

  const companyName = sorting.company?.name?.trim().slice(0, 200) ?? null;
  await transition(
    deps,
    importId,
    'sorting',
    {
      status: 'reading',
      company_name: companyName && companyName.length >= 2 ? companyName : null,
      company_cui: sorting.company?.cui ?? null,
    },
    [
      ...scans.map((fileId): ImportMessage => ({ type: 'scan', importId, fileId })),
      { type: 'read', importId, waits: 0 },
    ]
  );
}

/**
 * `waits` counts the polls since the scans last moved on, `progress` how far they had come: the
 * files no longer waiting on a scan and the scanned pages read.
 */
export async function readImport(
  deps: PipelineDeps,
  importId: string,
  waits: number,
  progress?: number
) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'reading') return;
  const files = await deps.store.listFiles(importId);
  // The scans are read by messages of their own; this one comes back until they are done.
  if (files.some((file) => file.state === 'prepared')) {
    const now =
      files.filter((file) => file.state !== 'prepared').length +
      (await deps.objects.list(folderOf(row))).filter((name) => pageReadingName.test(name)).length;
    const still = now === progress ? waits + 1 : 0;
    if (still >= maxReadWaits) throw new ImportFailure(importReasons.scansUnfinished);
    await requireQueue(deps).send(
      { type: 'read', importId, waits: still, progress: now },
      { delaySeconds: readPollSeconds }
    );
    return;
  }
  if (row.kind === 'employees') {
    if (!files.some((file) => file.state === 'read')) {
      throw new ImportFailure(importReasons.noSheetRead);
    }
    await transition(deps, importId, 'reading', { status: 'checking' }, [
      { type: 'check', importId },
    ]);
    return;
  }
  const loaded = await Promise.all(
    files.filter((file) => file.state === 'read').map((file) => loadPrepared(deps.objects, file))
  );
  const textual = loaded.filter((entry) => entry.text.trim() !== '');
  const readings: Reading[] = [];
  if (textual.length > 0) {
    const { provider, client } = await identityOf(deps, row);
    readings.push(
      await ask(deps, row, null, 'reading', {
        model: readingModel,
        messages: readingMessages({
          provider,
          client,
          files: textual.map((entry) => ({ path: entry.file.upload_path, text: entry.text })),
        }),
        answer: readingAnswer,
        reasoningEffort: 'medium',
        maxCompletionTokens: readingOutputTokens,
      })
    );
  }
  for (const entry of loaded) readings.push(...Object.values(entry.pages?.readings ?? {}));
  if (readings.length === 0) throw new ImportFailure(importReasons.nothingToRead);
  await transition(
    deps,
    importId,
    'reading',
    { status: 'checking', proposal: asJson(toProposal(...readings)) },
    [{ type: 'check', importId }]
  );
}

export async function checkImport(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'checking') return;
  if (row.kind === 'employees') {
    await checkSheets(deps, row);
    return;
  }
  const proposal = proposalSchema.parse(row.proposal);
  const all = await deps.store.listFiles(importId);
  const files = all.filter((file) => file.state === 'read');
  const texts: Record<string, string | null> = {};
  for (const entry of await Promise.all(files.map((file) => loadPrepared(deps.objects, file)))) {
    if (!isImage(entry.file)) {
      texts[entry.file.upload_path] = entry.text.trim() === '' ? null : entry.text;
    }
    for (const page of entry.pages?.pages.filter((each) => each.isScan) ?? []) {
      texts[pageLabel(entry.file, page.number)] = null;
    }
  }
  const setAsideFiles: Record<string, string> = {};
  // Only names are looked for in a set-aside file, so one that cannot be loaded never holds up
  // the check.
  const setAside = await Promise.allSettled(
    all
      .filter((file) => file.state === 'set_aside' && !isImage(file))
      .map((file) => loadPrepared(deps.objects, file))
  );
  for (const loaded of setAside) {
    if (loaded.status === 'fulfilled' && loaded.value.text.trim() !== '') {
      setAsideFiles[loaded.value.file.upload_path] = loaded.value.text;
    }
  }
  const registrations = await lookUpRegistrations(proposal, deps.registry);
  const checked = withChecks(proposal, {
    files: texts,
    setAsideFiles,
    clientExists: row.into_existing_client,
    registrations,
  });
  const found = proposal.client.cui.options
    .map((option) => registrations.get(option.value))
    .find((company) => company) as CompanyLookup | undefined;
  const registeredCompany: RegisteredCompany | null = found
    ? {
        cui: found.cui,
        legalName: found.legalName,
        vatPayer: found.vatPayer,
        inactive: found.inactive,
      }
    : null;
  // The library parts read once the posts they cite are proposed, and never hold up the client
  // (ADR 034).
  const reading = await deps.store.openLibraryParts(row, libraryPartsOf(all));
  const ready = await transition(
    deps,
    importId,
    'checking',
    {
      status: 'ready',
      proposal: asJson({ ...checked, registeredCompany }),
      reading_flags: asJson(clientReadingFlags(all, checked)),
      ready_at: new Date().toISOString(),
    },
    reading.map(({ part, attempt }): ImportMessage =>
      isInstructionsPart(part)
        ? { type: 'read-instructions', importId, part, attempt }
        : { type: 'read-risks', importId, attempt }
    )
  );
  if (ready) await alertImport(deps, importId, null, ['read']);
}
