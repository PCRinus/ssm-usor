import { type InstructionDomain, instructionDomains } from '@ssm-usor/contracts';
import { z } from 'zod';

import { cuiDigits, formsAgree, hasLegalForm, sameCompany } from './match';
import { answerFormat } from './wire';

export const documentKinds = [
  'decision',
  'own_instructions',
  'training_themes',
  'training_material',
  'risk_assessment',
  'fire_safety_document',
  'contract',
  'training_sheet',
  'blank_form',
  'risk_zones_record',
  'cover',
  'generic_text',
  'other',
] as const;

export type DocumentKind = (typeof documentKinds)[number];

export const fileTriageSchema = z.object({
  path: z.string(),
  kind: z.enum(documentKinds),
  companyName: z.string().nullable(),
  companyCui: z.string().nullable(),
  carriesClientData: z.boolean(),
  // Null for every kind but the two the own instructions are read from (ADR 034).
  domain: z.enum(instructionDomains).nullable(),
});

export type FileTriage = z.infer<typeof fileTriageSchema>;

export const sortingSchema = z.object({ files: z.array(fileTriageSchema) });

export type SortingAnswer = z.infer<typeof sortingSchema>;

export const domainKinds: readonly DocumentKind[] = ['own_instructions', 'training_themes'];

export const sortingAnswer = answerFormat('import_sorting', sortingSchema, (answer) => ({
  files: answer.files.map((file) =>
    domainKinds.includes(file.kind) ? file : { ...file, domain: null }
  ),
}));

// Own instructions and the general training material are the longest files of a pack. The own
// instructions are read apart, by their own request for the library (ADR 034); the general
// training material is the same in every pack. Neither goes to the client reading (ADR 030). The
// risk zones record is not read yet: it is only counted, to see whether packs hold one (ADR 037).
export const setAsideKinds: readonly DocumentKind[] = [
  'cover',
  'blank_form',
  'generic_text',
  'own_instructions',
  'training_material',
  'risk_zones_record',
];

export interface Company {
  name: string | null;
  cui: string | null;
}

export type FileOutcome =
  | { path: string; outcome: 'read' }
  | { path: string; outcome: 'set_aside'; kind: DocumentKind }
  | { path: string; outcome: 'employee_import' }
  | { path: string; outcome: 'other_company'; company: Company };

export interface Sorting {
  // Null when no file names a company.
  company: Company | null;
  files: FileOutcome[];
  // Most files first.
  otherCompanies: { company: Company; paths: string[] }[];
}

interface Group {
  cui: string | null;
  names: string[];
  paths: string[];
}

function groupName(group: Group) {
  return group.names[0] ?? null;
}

// One client per import (ADR 030): the company most files name, or the client being completed.
// A file sorting could not see, such as a scan, is read rather than set aside.
export function sortFiles(
  entries: { path: string; triage: FileTriage | null }[],
  options: { provider?: Company; client?: { legalName: string; cui: string } } = {}
): Sorting {
  const providerCui = cuiDigits(options.provider?.cui ?? null);
  const providerName = options.provider?.name ?? null;
  const isProvider = (cui: string | null, name: string | null) =>
    (cui !== null && cui === providerCui) ||
    (cui === null && name !== null && providerName !== null && sameCompany(name, providerName));

  const groups: Group[] = [];
  const clientGroup: Group | null = options.client
    ? { cui: cuiDigits(options.client.cui), names: [options.client.legalName], paths: [] }
    : null;
  if (clientGroup) groups.push(clientGroup);
  const companyOf = new Map<string, Group>();

  const named = entries.flatMap((entry) => {
    const name = entry.triage?.companyName?.trim() || null;
    const cui = cuiDigits(entry.triage?.companyCui ?? null);
    if ((name === null && cui === null) || isProvider(cui, name)) return [];
    return [{ path: entry.path, name, cui }];
  });

  for (const entry of named.filter((candidate) => candidate.cui !== null)) {
    let group = groups.find((known) => known.cui === entry.cui);
    if (!group) {
      group = { cui: entry.cui, names: [], paths: [] };
      groups.push(group);
    }
    if (entry.name !== null && !group.names.some((name) => sameCompany(name, entry.name!))) {
      group.names.push(entry.name);
    }
    group.paths.push(entry.path);
    companyOf.set(entry.path, group);
  }
  const nameOnly = new Map<string, string[]>();
  for (const entry of named.filter((candidate) => candidate.cui === null)) {
    nameOnly.set(entry.name!, [...(nameOnly.get(entry.name!) ?? []), entry.path]);
  }
  // A name without a form could join companies of two forms ("Alfa" with "Alfa SA" and "Alfa
  // SRL"), so the names with one go first, and the order of the files decides nothing. A CUI
  // already says which company its names are, whatever forms they write.
  const byName = [...nameOnly].sort(
    ([a, aPaths], [b, bPaths]) =>
      Number(hasLegalForm(b)) - Number(hasLegalForm(a)) ||
      bPaths.length - aPaths.length ||
      (a < b ? -1 : a > b ? 1 : 0)
  );
  for (const [name, paths] of byName) {
    const matches = groups.filter(
      (group) =>
        group.names.some((known) => sameCompany(known, name)) &&
        (group.cui !== null || group.names.every((known) => formsAgree(known, name)))
    );
    let group = matches.reduce<Group | undefined>(
      (best, each) => (best && best.paths.length >= each.paths.length ? best : each),
      undefined
    );
    if (!group) {
      group = { cui: null, names: [], paths: [] };
      groups.push(group);
    }
    group.names.push(name);
    group.paths.push(...paths);
    for (const path of paths) companyOf.set(path, group);
  }
  const order = new Map(entries.map((entry, index) => [entry.path, index]));
  for (const group of groups) group.paths.sort((a, b) => order.get(a)! - order.get(b)!);

  const chosen =
    clientGroup ??
    [...groups].sort(
      (a, b) => b.paths.length - a.paths.length || Number(b.cui !== null) - Number(a.cui !== null)
    )[0] ??
    null;

  const asCompany = (group: Group): Company => ({ name: groupName(group), cui: group.cui });

  const files = entries.map((entry): FileOutcome => {
    const group = companyOf.get(entry.path);
    if (group && group !== chosen) {
      return { path: entry.path, outcome: 'other_company', company: asCompany(group) };
    }
    const triage = entry.triage;
    if (triage === null) return { path: entry.path, outcome: 'read' };
    if (triage.kind === 'training_sheet') return { path: entry.path, outcome: 'employee_import' };
    // The themes give the intervals and categories a training decision often leaves out, and a
    // sorting that judged them generic would lose them.
    if (triage.kind === 'training_themes') return { path: entry.path, outcome: 'read' };
    if (setAsideKinds.includes(triage.kind) || !triage.carriesClientData) {
      return { path: entry.path, outcome: 'set_aside', kind: triage.kind };
    }
    return { path: entry.path, outcome: 'read' };
  });

  return {
    company: chosen ? asCompany(chosen) : null,
    files,
    otherCompanies: groups
      .filter((group) => group !== chosen && group.paths.length > 0)
      .sort((a, b) => b.paths.length - a.paths.length)
      .map((group) => ({ company: asCompany(group), paths: group.paths })),
  };
}

export interface LibraryFiles {
  instructions: string[];
  themes: string[];
}

export function libraryFiles(
  sorting: Sorting,
  triages: ReadonlyMap<string, FileTriage>
): Record<InstructionDomain, LibraryFiles> {
  const parts: Record<InstructionDomain, LibraryFiles> = {
    ssm: { instructions: [], themes: [] },
    su: { instructions: [], themes: [] },
  };
  for (const file of sorting.files) {
    if (file.outcome === 'other_company') continue;
    const triage = triages.get(file.path);
    if (!triage?.domain) continue;
    if (triage.kind === 'own_instructions') parts[triage.domain].instructions.push(file.path);
    if (triage.kind === 'training_themes') parts[triage.domain].themes.push(file.path);
  }
  return parts;
}
