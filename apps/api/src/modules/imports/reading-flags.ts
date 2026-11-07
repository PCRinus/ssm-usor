import type {
  InstructionDomain,
  InstructionImportChanges,
  RiskImportChanges,
} from '@ssm-usor/contracts';
import type {
  EmployeeImportProposal,
  InstructionsProposal,
  Proposal,
  RisksProposal,
} from '@ssm-usor/import';

import type { ImportFileRow } from './store';

// `file` is its place, from 1, among the import's files in the order they are listed.
export interface FilePlace {
  file: number;
  kind: string;
}

/**
 * What ADR 037 keeps of a reading on the import and on each library part: counts, places and
 * codes, never what was read.
 */
export interface ReadingFlags {
  files?: {
    total: number;
    byKind: Record<string, number>;
    unreadable: FilePlace[];
    setAside: number;
    forEmployees: number;
    otherCompany: number;
  };
  found: Record<string, number>;
  // The paths of the required values the reading left empty.
  emptyRequired?: string[];
  // By the code of a check that raised it.
  checks: Record<string, number>;
  // A file sorted as a kind that gave nothing of it.
  nothingFound?: FilePlace[];
  // Every value the reading proposed, which `quality` counts only in part for a client import.
  proposedValues?: number;
}

export type FileForFlags = Pick<
  ImportFileRow,
  'id' | 'upload_path' | 'mime_type' | 'state' | 'document_kind' | 'document_domain'
>;

export function fileKind(file: Pick<ImportFileRow, 'mime_type' | 'document_kind'>) {
  if (file.document_kind) return file.document_kind;
  if (file.mime_type.startsWith('image/')) return 'photo';
  if (file.mime_type === 'application/pdf') return 'pdf';
  return 'word';
}

const placeOf = (files: readonly FileForFlags[], file: FileForFlags): FilePlace => ({
  file: files.indexOf(file) + 1,
  kind: fileKind(file),
});

function tally(codes: Iterable<string>) {
  const counts: Record<string, number> = {};
  for (const code of codes) counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}

function filesFlags(files: readonly FileForFlags[]): NonNullable<ReadingFlags['files']> {
  const count = (state: FileForFlags['state']) => files.filter((file) => file.state === state);
  return {
    total: files.length,
    byKind: tally(files.map(fileKind)),
    unreadable: count('failed').map((file) => placeOf(files, file)),
    setAside: count('set_aside').length,
    forEmployees: count('for_employees').length,
    otherCompany: count('other_company').length,
  };
}

const clientLists = [
  'workplaces',
  'jobPositions',
  'responsiblePersons',
  'fireEquipment',
  'fireInstallations',
  'protectiveEquipment',
  'employees',
] as const;

const required = ['client.legalName', 'client.cui', 'jobPositions'] as const;

function proposedFields(proposal: Proposal) {
  return [proposal.client, proposal.trainingSchedule, proposal.fireSafety].flatMap((group) =>
    Object.values(group as Record<string, { options: unknown[] }>)
  );
}

export function clientReadingFlags(
  files: readonly FileForFlags[],
  proposal: Proposal | null
): ReadingFlags {
  if (!proposal) return { files: filesFlags(files), found: {}, checks: {} };
  const fields = proposedFields(proposal).filter((field) => field.options.length > 0);
  const empty = {
    'client.legalName': proposal.client.legalName.options.length === 0,
    'client.cui': proposal.client.cui.options.length === 0,
    jobPositions: proposal.jobPositions.length === 0,
  };
  return {
    files: filesFlags(files),
    found: {
      clientFields: fields.length,
      ...Object.fromEntries(clientLists.map((list) => [list, proposal[list].length])),
    },
    emptyRequired: required.filter((path) => empty[path]),
    checks: tally(proposal.flags.map((flag) => flag.code)),
    proposedValues:
      fields.length + clientLists.reduce((sum, list) => sum + proposal[list].length, 0),
  };
}

export function employeeReadingFlags(
  files: readonly FileForFlags[],
  proposal: EmployeeImportProposal | null
): ReadingFlags {
  if (!proposal) return { files: filesFlags(files), found: {}, checks: {} };
  const rows = proposal.pages.flatMap((page) => page.rows);
  const placed = new Set(
    proposal.pages.filter((page) => page.personId !== null).map((page) => page.fileId)
  );
  return {
    files: filesFlags(files),
    found: {
      pages: proposal.pages.length,
      unreadablePages: proposal.pages.filter((page) => page.kind === null).length,
      people: proposal.people.length,
      trainingRows: rows.length,
      tests: rows.filter((row) => row.test !== null).length,
    },
    checks: tally([
      ...proposal.people.flatMap((person) => person.flags.map((flag) => `person.${flag.code}`)),
      ...rows.flatMap((row) => row.flags.map((code) => `row.${code}`)),
    ]),
    nothingFound: files
      .filter((file) => file.state === 'read' && !placed.has(file.id))
      .map((file) => ({ ...placeOf(files, file), kind: 'training_sheet' })),
  };
}

export function instructionsReadingFlags(
  files: readonly FileForFlags[],
  domain: InstructionDomain,
  proposal: InstructionsProposal
): ReadingFlags {
  const cut = new Set(proposal.instructions.map((instruction) => instruction.file));
  return {
    found: {
      instructions: proposal.instructions.length,
      unread: proposal.unread.length,
      positions: proposal.positions.length,
      undecidedPositions: proposal.positions.filter(
        (position) => position.resolution.kind === 'undecided'
      ).length,
    },
    checks: tally([
      ...proposal.instructions.flatMap((instruction) =>
        instruction.flags.map((flag) => `instruction.${flag.kind}`)
      ),
      ...proposal.unread.map((unread) => `unread.${unread.reason}`),
    ]),
    nothingFound: files
      .filter(
        (file) =>
          file.document_kind === 'own_instructions' &&
          file.document_domain === domain &&
          !cut.has(file.upload_path)
      )
      .map((file) => placeOf(files, file)),
  };
}

export function risksReadingFlags(
  files: readonly FileForFlags[],
  proposal: RisksProposal
): ReadingFlags {
  const factors = proposal.sheets.flatMap((sheet) => sheet.factors);
  const withFactors = new Set(
    proposal.sheets.filter((sheet) => sheet.factors.length > 0).map((sheet) => sheet.file)
  );
  return {
    found: {
      evaluationSheets: proposal.sheets.length,
      sheetsWithoutFactors: proposal.sheets.filter((sheet) => sheet.factors.length === 0).length,
      factors: factors.length,
      unplacedRows: proposal.unplacedRows.length,
      unmatchedPlanRows: proposal.unmatchedPlanRows.length,
      unmatchedMeasureRows: proposal.unmatchedMeasureRows.length,
    },
    checks: tally([
      ...proposal.sheets.flatMap((sheet) => sheet.flags.map((flag) => `sheet.${flag.kind}`)),
      ...factors.flatMap((factor) => factor.flags.map((flag) => `factor.${flag.kind}`)),
    ]),
    nothingFound: files
      .filter(
        (file) =>
          file.document_kind === 'risk_assessment' &&
          file.state === 'read' &&
          !withFactors.has(file.upload_path)
      )
      .map((file) => placeOf(files, file)),
  };
}

export type QualityCounts = Record<string, { changed: number; unticked: number; kept: number }>;

const definedBesides = (change: object, ...left: string[]) =>
  Object.entries(change).some(([key, value]) => !left.includes(key) && value !== undefined);

export function instructionsQuality(
  proposal: InstructionsProposal,
  changes: InstructionImportChanges | null
): QualityCounts {
  const counts = { changed: 0, unticked: 0, kept: 0 };
  for (const instruction of proposal.instructions) {
    const change = changes?.instructions[instruction.key];
    if (change?.included === false) counts.unticked++;
    else if (change && definedBesides(change, 'included')) counts.changed++;
    else counts.kept++;
  }
  return { instructions: counts };
}

export function risksQuality(
  proposal: RisksProposal,
  changes: RiskImportChanges | null
): QualityCounts {
  const sheets = { changed: 0, unticked: 0, kept: 0 };
  const factors = { changed: 0, unticked: 0, kept: 0 };
  for (const sheet of proposal.sheets) {
    const change = changes?.sheets[sheet.key];
    const proposed = sheet.factors.filter((factor) => factor.included);
    if (
      proposed.length > 0 &&
      proposed.every((factor) => change?.factors?.[factor.key]?.included === false)
    ) {
      sheets.unticked++;
    } else if (change && definedBesides(change, 'factors')) sheets.changed++;
    else sheets.kept++;
    for (const factor of sheet.factors) {
      const own = change?.factors?.[factor.key];
      const included = own?.included ?? factor.included;
      if (factor.included && !included) factors.unticked++;
      else if (own && (included !== factor.included || definedBesides(own, 'included'))) {
        factors.changed++;
      } else if (included) factors.kept++;
    }
  }
  return { sheets, factors };
}

// A client import's `kept` counts only the values an existing client kept, so its whole is the
// values proposed.
export function changedShare(quality: unknown, proposedValues?: number) {
  if (!quality || typeof quality !== 'object') return null;
  let changed = 0;
  let kept = 0;
  for (const counts of Object.values(quality as QualityCounts)) {
    if (!counts || typeof counts !== 'object') continue;
    changed += Number(counts.changed ?? 0) + Number(counts.unticked ?? 0);
    kept += Number(counts.kept ?? 0);
  }
  const whole = Math.max(changed + kept, proposedValues ?? 0);
  return whole === 0 ? null : { changed, whole, share: changed / whole };
}
