import {
  type ImportLibraryPart,
  type InstructionsPart,
  instructionsPartDomains,
  libraryPartDays,
} from '@ssm-usor/contracts';
import {
  type CompletionRequest,
  DocxReadError,
  GatewayError,
  type InstructionsAnswer,
  instructionsCharacters,
  type InstructionsFile,
  instructionsRequest,
  InstructionsTooLargeError,
  judgements,
  libraryTitle,
  ModelAnswerError,
  pairsToJudge,
  type Proposal,
  proposalSchema,
  proposeInstructions,
  proposeRisks,
  readInstructionsAnswer,
  readInstructionsDocx,
  readRisksAnswer,
  retypeBatches,
  type RetypedAnswer,
  retypeRequest,
  type RisksAnswer,
  risksCharacters,
  type RisksProposal,
  risksRequest,
  type RisksTextFile,
  RisksTooLargeError,
  similarityRequest,
  withRetyped,
} from '@ssm-usor/import';

import {
  claimed,
  dataUrl,
  ImportFailure,
  importReasons,
  isImage,
  isLibraryFile,
  isRiskFile,
  isTransient,
  loadPrepared,
  pageImage,
  pageLabel,
  type PipelineDeps,
} from './pipeline';
import { existingByPostName } from './risk-sheets';
import { asJson, type ImportFileRow, type ImportRow } from './store';

const number = new Intl.NumberFormat('ro-RO');

export const libraryReasons = {
  noText: 'Nu am găsit textul instrucțiunilor proprii în fișierele importului.',
  tooLarge: (characters: number) =>
    `Instrucțiunile proprii și tematicile au ${number.format(characters)} de caractere, mai mult decât încap într-o citire (${number.format(instructionsCharacters)}).`,
  modelRefused: 'Modelul a refuzat să citească instrucțiunile proprii.',
  modelFailed:
    'Modelul nu a dat un răspuns pe care să-l putem folosi pentru instrucțiunile proprii.',
  failed: 'Citirea instrucțiunilor proprii s-a oprit din cauza unei erori.',
  stalled: 'Citirea instrucțiunilor proprii s-a oprit înainte să se termine.',
} as const;

export const riskReasons = {
  noText: 'Nu am găsit textul evaluării riscurilor în fișierele importului.',
  tooLarge: (characters: number) =>
    `Evaluarea riscurilor și planul de prevenire au ${number.format(characters)} de caractere, mai mult decât încap într-o citire (${number.format(risksCharacters)}).`,
  modelRefused: 'Modelul a refuzat să citească evaluarea riscurilor.',
  modelFailed: 'Modelul nu a dat un răspuns pe care să-l putem folosi pentru evaluarea riscurilor.',
  failed: 'Citirea evaluărilor de risc s-a oprit din cauza unei erori.',
  stalled: 'Citirea evaluărilor de risc s-a oprit înainte să se termine.',
} as const;

export const libraryPartExpiry = (clientConfirmedAt: string | null) =>
  clientConfirmedAt
    ? new Date(Date.parse(clientConfirmedAt) + libraryPartDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const pathOf = (row: Pick<ImportRow, 'organization_id' | 'id'>, name: string) =>
  `${row.organization_id}/${row.id}/${name}`;

// Word's own numbers and notes, which the text kept for the client reading leaves out (ADR 034).
async function instructionsFile(
  deps: PipelineDeps,
  file: ImportFileRow
): Promise<InstructionsFile | null> {
  const word = file.mime_type === docxType ? file.storage_path : file.derived_path;
  if (file.mime_type === docxType || file.mime_type === 'application/msword') {
    if (!word) return null;
    try {
      const read = readInstructionsDocx(await deps.objects.read(word));
      return { path: file.upload_path, paragraphs: read.paragraphs, text: read.text };
    } catch (error) {
      if (error instanceof DocxReadError) return null;
      throw error;
    }
  }
  if (file.mime_type !== 'application/pdf') return null;
  const lines = (await loadPrepared(deps.objects, file)).text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return {
    path: file.upload_path,
    paragraphs: lines.map((text) => ({ text })),
    text: lines.join('\n'),
  };
}

async function themesFile(deps: PipelineDeps, file: ImportFileRow) {
  const text = (await loadPrepared(deps.objects, file)).text;
  return text.trim() ? { path: file.upload_path, text } : null;
}

async function askForPart<T>(
  deps: PipelineDeps,
  row: ImportRow,
  part: ImportLibraryPart,
  request: Omit<CompletionRequest<T>, 'metadata'>
): Promise<T> {
  if (!deps.model) throw new ImportFailure(importReasons.notConfigured);
  const record = async (
    usage: { input: number; cachedInput: number; output: number },
    cost: number
  ) => {
    if (usage.input + usage.cachedInput + usage.output === 0) return;
    // Paying for a request twice is worse than a missing count, so a failure here is not retried.
    await deps.store
      .recordLibraryPartUsage(row.id, part, usage, cost)
      .catch((error: unknown) =>
        console.error(`Usage of library part ${part} of import ${row.id} was not recorded.`, error)
      );
  };
  try {
    const completion = await deps.model.complete({
      ...request,
      metadata: { organizationId: row.organization_id, importId: row.id, part },
    });
    await record(completion.usage, completion.cost);
    return completion.value;
  } catch (error) {
    if (error instanceof GatewayError || error instanceof ModelAnswerError) {
      await record(error.usage, error.cost);
    }
    throw error;
  }
}

const companySuffix =
  /[\s,]+(?:S\.?\s?C\.?|S\.?\s?R\.?\s?L\.?(?:-?D)?|S\.?\s?A\.?|P\.?\s?F\.?\s?A\.?|I\.?\s?I\.?)\s*$/iu;

// "S.C. ROYAL HOTEL S.R.L." is "Royal Hotel" after a module's title the library already has.
export function shortClientName(legalName: string) {
  let name = legalName.trim().replace(/^S\.?\s?C\.?\s+/iu, '');
  while (companySuffix.test(name)) name = name.replace(companySuffix, '');
  name = name.trim() || legalName.trim();
  return name === name.toUpperCase()
    ? name
        .toLowerCase()
        .replace(/(^|[\s-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase())
    : name;
}

async function clientOf(deps: PipelineDeps, row: ImportRow) {
  const proposal = proposalSchema.safeParse(row.proposal);
  const existing = row.client_id ? await deps.store.client(row.client_id) : null;
  const legalName =
    existing?.legalName ??
    (proposal.success ? proposal.data.client.legalName.options[0]?.value : undefined) ??
    row.company_name ??
    '';
  return {
    posts: proposal.success ? proposal.data.jobPositions.map((position) => position.name) : [],
    client: { name: shortClientName(legalName), legalName },
    people: proposal.success ? clientPeople(proposal.data) : [],
  };
}

export function clientPeople(proposal: Proposal) {
  return [
    ...proposal.client.legalRepresentativeName.options.map((option) => String(option.value)),
    ...proposal.responsiblePersons.map((person) => person.fullName),
    ...proposal.employees.map((employee) =>
      [employee.firstName, employee.lastName].filter(Boolean).join(' ')
    ),
  ].filter((name) => name.trim() !== '');
}

async function keptAnswer<T>(
  deps: PipelineDeps,
  row: ImportRow,
  name: string,
  ask: () => Promise<T>
): Promise<T> {
  const path = pathOf(row, `${name}.json`);
  const kept = await deps.objects
    .read(path)
    .then((bytes) => JSON.parse(decoder.decode(bytes)) as T)
    .catch(() => null);
  if (kept) return kept;
  const answer = await ask();
  await deps.objects.write(path, encoder.encode(JSON.stringify(answer)), 'application/json');
  return answer;
}

// Kept as it came, so a delivery that is retried after the answer, for the comparison, does not
// send the dearest request again.
const answerOf = <T>(
  deps: PipelineDeps,
  row: ImportRow,
  part: ImportLibraryPart,
  attempt: number,
  request: Omit<CompletionRequest<T>, 'metadata'>
) =>
  keptAnswer(deps, row, `${part}.${attempt}.answer`, async () => {
    await deps.store.chargeLibraryPart(row, part, attempt);
    return askForPart(deps, row, part, request);
  });

export async function readInstructions(
  deps: PipelineDeps,
  importId: string,
  part: InstructionsPart,
  attempt: number,
  owner: string
) {
  const row = await deps.store.getImport(importId);
  if (!row || (row.status !== 'ready' && row.status !== 'confirmed')) return;
  const current = await deps.store.getLibraryPart(importId, part);
  if (!current || current.status !== 'reading' || current.attempt !== attempt) return;
  if (!(await claimed(deps, pathOf(row, `${part}.${attempt}.claim.json`), owner))) return;

  const domain = instructionsPartDomains[part];
  const files = (await deps.store.listFiles(importId)).filter(
    (file) => isLibraryFile(file) && file.document_domain === domain
  );
  const instructions: InstructionsFile[] = [];
  const themes: { path: string; text: string }[] = [];
  for (const file of files) {
    const read =
      file.document_kind === 'own_instructions'
        ? await instructionsFile(deps, file)
        : await themesFile(deps, file);
    if (!read) continue;
    if (file.document_kind === 'own_instructions') instructions.push(read as InstructionsFile);
    else themes.push(read);
  }
  if (instructions.length === 0) throw new ImportFailure(libraryReasons.noText);

  const { posts, client } = await clientOf(deps, row);
  let request;
  try {
    request = instructionsRequest({
      domain,
      instructions: instructions.map((file) => ({ path: file.path, text: file.text })),
      themes,
      posts,
    });
  } catch (error) {
    if (error instanceof InstructionsTooLargeError) {
      throw new ImportFailure(libraryReasons.tooLarge(error.characters));
    }
    throw error;
  }
  const answer = await answerOf<InstructionsAnswer>(deps, row, part, attempt, request);
  const read = readInstructionsAnswer(domain, instructions, answer);

  const library = await deps.store.libraryModules(row.organization_id);
  const pairs = await pairsToJudge(read, library);
  let judged: Map<string, boolean> | undefined;
  if (pairs.length > 0) {
    const pack = read.instructions.map((instruction) => ({
      key: instruction.key,
      title: libraryTitle(instruction.title),
      body: instruction.body,
    }));
    try {
      judged = judgements(
        await askForPart(deps, row, part, similarityRequest(pairs, pack, library))
      );
    } catch (error) {
      // An unjudged pair is proposed as new rather than failing a reading already paid for.
      if (isTransient(error)) throw error;
      console.error(`The pairs of library part ${part} of import ${importId} were not judged.`);
    }
  }

  const proposal = await proposeInstructions({ read, library, client, judged });
  await deps.store.updateLibraryPart(importId, part, attempt, {
    status: proposal.instructions.some((instruction) => instruction.status !== 'identical')
      ? 'to_review'
      : 'nothing_new',
    proposal: asJson(proposal),
    read_at: new Date().toISOString(),
  });
}

export function libraryFailureReason(error: unknown): string {
  if (error instanceof ImportFailure) return error.reason;
  if (error instanceof ModelAnswerError) {
    return error.reason === 'refused' ? libraryReasons.modelRefused : libraryReasons.modelFailed;
  }
  if (error instanceof GatewayError) return importReasons.unavailable;
  return libraryReasons.failed;
}

const risksPart = 'risk_evaluations' satisfies ImportLibraryPart;

// A Word file keeps its table rows for the request to point at; a PDF's text pages have none,
// and its scanned pages go as images, charged as the client reading charged them (ADR 036).
async function risksFile(
  deps: PipelineDeps,
  row: ImportRow,
  file: ImportFileRow
): Promise<RisksTextFile | null> {
  const prepared = await loadPrepared(deps.objects, file);
  const scanned = isImage(file)
    ? [1]
    : (prepared.pages?.pages.filter((page) => page.isScan).map((page) => page.number) ?? []);
  const scans: NonNullable<RisksTextFile['scans']> = [];
  if (scanned.length > 0) {
    const image = await pageImage(deps, file);
    for (const page of scanned) {
      if (!isImage(file)) await deps.store.chargeScannedPage(row, file.id, page);
      const picture = await image(page);
      scans.push({
        label: pageLabel(file, page),
        imageUrl: dataUrl(picture.bytes, picture.type),
      });
    }
  }
  if (prepared.text.trim() === '' && scans.length === 0) return null;
  return { path: file.upload_path, text: prepared.text, ...(scans.length ? { scans } : {}) };
}

// A sheet the library already has still writes its factors onto the client's sheets on confirm,
// which only the specialist's confirm does: "Nimic nou" would read as nothing left to do.
export const asksForReview = (sheet: RisksProposal['sheets'][number]) =>
  sheet.status === 'new' ||
  sheet.status === 'similar' ||
  (sheet.factors.length > 0 && (sheet.kind !== 'job_position' || sheet.posts.length > 0));

export async function readRiskEvaluations(
  deps: PipelineDeps,
  importId: string,
  attempt: number,
  owner: string
) {
  const row = await deps.store.getImport(importId);
  if (!row || (row.status !== 'ready' && row.status !== 'confirmed')) return;
  const current = await deps.store.getLibraryPart(importId, risksPart);
  if (!current || current.status !== 'reading' || current.attempt !== attempt) return;
  if (!(await claimed(deps, pathOf(row, `${risksPart}.${attempt}.claim.json`), owner))) return;

  const files: RisksTextFile[] = [];
  for (const file of (await deps.store.listFiles(importId)).filter(isRiskFile)) {
    const read = await risksFile(deps, row, file);
    if (read) files.push(read);
  }
  if (files.length === 0) throw new ImportFailure(riskReasons.noText);

  const { posts, client, people } = await clientOf(deps, row);
  const provider = await deps.store.provider(row.organization_id);
  const input = { files, posts };
  let request;
  try {
    request = risksRequest(input);
  } catch (error) {
    if (error instanceof RisksTooLargeError) {
      throw new ImportFailure(riskReasons.tooLarge(error.characters));
    }
    throw error;
  }
  const first = await answerOf<RisksAnswer>(deps, row, risksPart, attempt, request);
  const later: RetypedAnswer[] = [];
  for (const [index, headings] of retypeBatches(input, first).entries()) {
    later.push(
      await keptAnswer(deps, row, `${risksPart}.${attempt}.retyped-${index + 1}`, () =>
        askForPart(deps, row, risksPart, retypeRequest(input, headings))
      )
    );
  }
  const read = readRisksAnswer(files, withRetyped(first, later), {
    people: [...people, ...provider.people],
  });

  const library = await deps.store.riskLibrary(row.organization_id);
  const existing = row.client_id
    ? existingByPostName(await deps.store.clientSheets(row.client_id), posts)
    : undefined;
  const proposal = proposeRisks({
    read,
    posts,
    library: library.entries,
    takenNames: library.names,
    client,
    existing,
  });
  await deps.store.updateLibraryPart(importId, risksPart, attempt, {
    status: proposal.sheets.some(asksForReview) ? 'to_review' : 'nothing_new',
    proposal: asJson(proposal),
    read_at: new Date().toISOString(),
  });
}

export function riskFailureReason(error: unknown): string {
  if (error instanceof ImportFailure) return error.reason;
  if (error instanceof ModelAnswerError) {
    return error.reason === 'refused' ? riskReasons.modelRefused : riskReasons.modelFailed;
  }
  if (error instanceof GatewayError) return importReasons.unavailable;
  return riskReasons.failed;
}

export async function failLibraryPart(
  deps: PipelineDeps,
  importId: string,
  part: ImportLibraryPart,
  attempt: number,
  reason: string
) {
  await deps.store.updateLibraryPart(importId, part, attempt, {
    status: 'failed',
    failure_reason: reason,
    failed_at: new Date().toISOString(),
  });
}
