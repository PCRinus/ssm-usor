import {
  type EmployeeImportChanges,
  foldText,
  instructionImportChangesSchema,
  riskImportChangesSchema,
} from '@ssm-usor/contracts';
import {
  bodyText,
  type EmployeeImportPayload,
  type EmployeeImportProposal,
  instructionsProposalSchema,
  reviewedRiskFactors,
  reviewedSheetTexts,
  type RisksProposal,
  risksProposalSchema,
  toEmployeePayload,
} from '@ssm-usor/import';

import {
  storedEmployeeChanges,
  storedEmployeeProposal,
} from '../../../src/modules/imports/employees';
import { storedChanges, storedProposal } from '../../../src/modules/imports/handlers';
import {
  positionPostsOf,
  reviewedInstructions,
} from '../../../src/modules/imports/library-handlers';
import {
  type ClientImportPayload,
  noExistingRecords,
  toClientPayload,
} from '../../../src/modules/imports/payload';
import type { ResultRow, Sections, Value } from './compare';

type Row = Record<string, unknown>;

export class NoResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoResultError';
  }
}

const key = (value: unknown) => foldText(String(value ?? ''));

// Unread changes would leave the answer as the unreviewed proposal, which flatters the reading.
function readChanges<T>(changes: unknown, read: (value: unknown) => T | null): T | null {
  if (changes === null || changes === undefined) return null;
  const decided = read(changes);
  if (decided === null) throw new NoResultError("The copy's changes no longer read.");
  return decided;
}

const parsedWith =
  <T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }) =>
  (value: unknown) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };

function valueOf(value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String).sort().join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return value as Value;
}

const valuesOf = (row: Row, leftOut: readonly string[]) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([name]) => !leftOut.includes(name))
      .map(([name, value]) => [name, valueOf(value)])
  );

const fullName = (row: { last_name?: unknown; first_name?: unknown }) =>
  [row.last_name, row.first_name]
    .filter((part) => part !== undefined && part !== null)
    .join(' ')
    .trim();

export function clientSections(payload: ClientImportPayload): Sections {
  const named = (rows: Row[], name: (row: Row) => string) =>
    new Map(rows.map((row) => [String(row.key), name(row)]));
  const workplaces = named(payload.workplaces, (row) => String(row.name ?? ''));
  const posts = named(payload.job_positions, (row) => String(row.name ?? ''));
  const employees = named(payload.employees, fullName);
  // A key names a row of this payload; an id one of the client's, which a test run has not.
  const reference = (row: Row, names: Map<string, string>, of: string) =>
    row[`${of}_key`] !== undefined
      ? (names.get(String(row[`${of}_key`])) ?? null)
      : ((row[`${of}_id`] as string | undefined) ?? null);
  const single = (section: string, row: Row | undefined, leftOut: string[]): ResultRow[] =>
    row ? [{ identities: [section], group: section, values: valuesOf(row, leftOut) }] : [];
  const references = ['key', 'id', 'replace'];

  return {
    client: single('client', payload.client, ['replace', 'vat_payer']),
    fireSafety: single('fireSafety', payload.fire_safety, ['replace']),
    workplaces: payload.workplaces.map((row) => ({
      identities: [key(row.name), key(row.address_line)],
      group: null,
      values: valuesOf(row, references),
    })),
    jobPositions: payload.job_positions.map((row) => ({
      identities: [key(row.name)],
      group: null,
      values: valuesOf(row, references),
    })),
    protectiveEquipment: payload.equipment.map((row) => {
      const post = reference(row, posts, 'job_position');
      return {
        identities: [`${key(post)}|${key(row.item)}`],
        group: key(post),
        values: { post, ...valuesOf(row, ['job_position_key', 'job_position_id']) },
      };
    }),
    employees: payload.employees.map((row) => ({
      identities: [key(fullName(row)), key(row.cnp)],
      group: null,
      values: {
        ...valuesOf(row, ['key', 'job_position_key', 'job_position_id']),
        post: reference(row, posts, 'job_position'),
      },
    })),
    responsiblePersons: payload.responsible_persons.map((row) => ({
      identities: [key(row.full_name)],
      group: null,
      values: {
        ...valuesOf(row, ['employee_key', 'employee_id', 'workplace_key', 'workplace_id']),
        workplace: reference(row, workplaces, 'workplace'),
        employee: reference(row, employees, 'employee'),
      },
    })),
    fireEquipment: payload.fire_equipment.map((row) => {
      const workplace = reference(row, workplaces, 'workplace');
      return {
        identities: [
          [workplace, row.kind, row.agent, row.capacity, row.location].map(key).join('|'),
        ],
        group: `${key(workplace)}|${key(row.kind)}`,
        values: { workplace, ...valuesOf(row, ['workplace_key', 'workplace_id']) },
      };
    }),
    fireInstallations: payload.fire_installations.map((row) => {
      const workplace = reference(row, workplaces, 'workplace');
      return {
        identities: [`${key(workplace)}|${key(row.kind)}`],
        group: key(workplace),
        values: { workplace, ...valuesOf(row, ['workplace_key', 'workplace_id']) },
      };
    }),
  };
}

/**
 * Both sides are written as for a new client: a member's match to a row the client had, and the
 * values it kept from that row, are not the reading's, and a test run cannot see that row.
 */
export function confirmedClient(proposal: unknown, changes: unknown): Sections {
  const stored = storedProposal(proposal);
  if (!stored) throw new NoResultError('The copy keeps no client proposal.');
  return clientSections(
    toClientPayload({
      proposal: stored.proposal,
      changes: readChanges(changes, storedChanges),
      intoExistingClient: false,
      existing: noExistingRecords,
    }).payload
  );
}

export function readClient(proposal: unknown): Sections {
  return confirmedClient(proposal, null);
}

export function employeeSections(payload: EmployeeImportPayload): Sections {
  const people = new Map(payload.employees.map((row) => [row.key, fullName(row)]));
  return {
    people: payload.employees.map((row) => ({
      identities: [key(fullName(row)), key(row.cnp)],
      group: null,
      values: valuesOf(row as unknown as Row, [
        'key',
        'id',
        'replace',
        'job_position_id',
        'workplace_id',
      ]),
    })),
    trainings: payload.trainings.flatMap((training) =>
      training.records.map((record) => {
        const person = key(people.get(record.employee_key));
        return {
          identities: [
            person ? `${person}|${training.domain}|${training.phase}|${training.held_on}` : '',
          ],
          group: `${person}|${training.domain}|${training.phase}`,
          values: {
            ...valuesOf(training as unknown as Row, ['key', 'records', 'domain', 'phase']),
            ...valuesOf(record, ['employee_key']),
          },
        };
      })
    ),
    tests: payload.test_results.map((result) => {
      const person = key(people.get(result.employee_key));
      return {
        identities: [person ? `${person}|${result.domain}|${result.test}` : ''],
        group: `${person}|${result.domain}`,
        values: valuesOf(result as unknown as Row, ['employee_key', 'domain', 'test', 'material']),
      };
    }),
  };
}

// What the sheets say, as the member settled it: a person matched to one of the client's
// employees resolves to that employee's values, which are the app's, not the reading's.
const sheetsOnly = (proposal: EmployeeImportProposal): EmployeeImportProposal => ({
  ...proposal,
  people: proposal.people.map((person) => ({
    ...person,
    existing: null,
    fields: Object.fromEntries(
      Object.entries(person.fields).map(([name, field]) => [name, { options: field.options }])
    ) as typeof person.fields,
  })),
});

const noRecords = { jobPositions: [], workplaces: [], employees: [] };

export function confirmedEmployees(proposal: unknown, changes: unknown, today: string): Sections {
  const stored = storedEmployeeProposal(proposal);
  if (!stored) throw new NoResultError('The copy keeps no employee proposal.');
  const decided = readChanges(changes, storedEmployeeChanges);
  const withoutMatches: EmployeeImportChanges | null = decided && {
    ...decided,
    people: Object.fromEntries(
      Object.entries(decided.people).map(([id, change]) => [id, { ...change, existing: undefined }])
    ),
  };
  return employeeSections(
    toEmployeePayload({
      proposal: sheetsOnly(stored),
      changes: withoutMatches,
      records: noRecords,
      today,
    }).payload
  );
}

/** Every person the reading proposes counts as checked, as a member's tick would make them. */
export function readEmployees(proposal: unknown, today: string): Sections {
  const read = storedEmployeeProposal(proposal);
  if (!read) throw new NoResultError('The reading gave no employee proposal.');
  return employeeSections(
    toEmployeePayload({
      proposal: sheetsOnly(read),
      changes: {
        people: Object.fromEntries(read.people.map((person) => [person.id, { state: 'checked' }])),
        jobTitles: {},
        workplaces: {},
        rows: {},
        pages: {},
      },
      records: noRecords,
      today,
    }).payload
  );
}

// A part's posts are references to the client proposal's posts, which the copy of its import
// names.
function postNames(importProposal: unknown) {
  const posts = new Map(
    (storedProposal(importProposal)?.proposal.jobPositions ?? []).map((post) => [
      post.id,
      post.name,
    ])
  );
  return (reference: string) => posts.get(reference) ?? reference;
}

export function instructionSections(
  proposal: unknown,
  changes: unknown,
  importProposal: unknown
): Sections {
  const parsed = instructionsProposalSchema.safeParse(proposal);
  if (!parsed.success) throw new NoResultError('The copy keeps no instructions proposal.');
  const decided = readChanges(changes, parsedWith(instructionImportChangesSchema));
  const postName = postNames(importProposal);
  const reviewed = reviewedInstructions(
    parsed.data,
    decided,
    positionPostsOf(parsed.data, { proposal: importProposal as never })
  );
  return {
    instructions: reviewed.map((each) => ({
      identities: [`${each.instruction.file}|${each.instruction.number}`, key(each.title)],
      group: null,
      values: {
        title: each.title,
        category: each.category,
        body: bodyText(each.body),
        posts: valueOf(each.references.map(postName)),
      },
    })),
  };
}

const sheetIdentity = (sheet: RisksProposal['sheets'][number]) =>
  `${sheet.kind}|${key(sheet.kind === 'other' ? sheet.name : sheet.heading)}`;

export function riskSections(
  proposal: unknown,
  changes: unknown,
  importProposal: unknown
): Sections {
  const parsed = risksProposalSchema.safeParse(proposal);
  if (!parsed.success) throw new NoResultError('The copy keeps no risks proposal.');
  const risks = parsed.data as RisksProposal;
  const sheetChanges = readChanges(changes, parsedWith(riskImportChangesSchema));
  const postName = postNames(importProposal);
  const { reviewed } = reviewedRiskFactors(risks, sheetChanges);
  const written = risks.sheets.filter((sheet) => (reviewed.get(sheet.key) ?? []).length > 0);
  return {
    sheets: written.map((sheet) => {
      const change = sheetChanges?.sheets[sheet.key];
      const posts =
        sheet.kind === 'job_position'
          ? (change?.posts?.map(postName) ?? sheet.posts.map((post) => post.name))
          : [];
      return {
        identities: [sheetIdentity(sheet), `${sheet.kind}|${key(sheet.name)}`],
        group: null,
        values: { ...reviewedSheetTexts(sheet, change), posts: valueOf(posts) },
      };
    }),
    factors: written.flatMap((sheet) =>
      reviewed.get(sheet.key)!.map((factor) => ({
        identities: [`${sheetIdentity(sheet)}|${factor.component}|${key(factor.description)}`],
        group: `${sheetIdentity(sheet)}|${factor.component}`,
        values: {
          group: factor.group,
          description: factor.description,
          gravity_class: factor.gravity_class,
          probability_class: factor.probability_class,
          measures: valueOf(
            factor.measures.map((measure) => `${measure.kind}: ${measure.description}`)
          ),
          actions: factor.actions,
          deadline: factor.deadline,
          responsible_person: factor.responsible_person,
          observations: factor.observations,
        },
      }))
    ),
  };
}
