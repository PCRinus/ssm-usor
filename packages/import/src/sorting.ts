import { z } from 'zod';

import { cuiDigits, sameName } from './match';
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
});

export type FileTriage = z.infer<typeof fileTriageSchema>;

export const sortingSchema = z.object({ files: z.array(fileTriageSchema) });

export type SortingAnswer = z.infer<typeof sortingSchema>;

export const sortingAnswer = answerFormat('import_sorting', sortingSchema);

// Own instructions and the general training material are the longest files of a pack and
// boilerplate: the app builds the first from the provider's library (ADR 012), and the second is
// the same in every pack. They are read only when the member sends them back (ADR 030).
export const setAsideKinds: readonly DocumentKind[] = [
  'cover',
  'blank_form',
  'generic_text',
  'own_instructions',
  'training_material',
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
    (cui === null && name !== null && providerName !== null && sameName(name, providerName));

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
    if (entry.name !== null && !group.names.some((name) => sameName(name, entry.name!))) {
      group.names.push(entry.name);
    }
    group.paths.push(entry.path);
    companyOf.set(entry.path, group);
  }
  for (const entry of named.filter((candidate) => candidate.cui === null)) {
    const matches = groups.filter((group) =>
      group.names.some((name) => sameName(name, entry.name!))
    );
    let group = matches.sort((a, b) => b.paths.length - a.paths.length)[0];
    if (!group) {
      group = { cui: null, names: [entry.name!], paths: [] };
      groups.push(group);
    }
    group.paths.push(entry.path);
    companyOf.set(entry.path, group);
  }

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
