import {
  type DocumentTypeKey,
  isLegalRepresentative,
  printedDate,
  type SsmDutiesFingerprints,
  type SsmDutyRole,
  ssmDutyRoles,
  trainingIntervalLabel,
} from '@ssm-usor/contracts';
import { ssmDutiesWording } from '@ssm-usor/document-engine/ssm-duties';

import type { Json } from '../../database.types';
import { sha256 } from '../../lib/hash';
import { stableJson } from '../../lib/json';
import { listed } from '../../lib/romanian';
import type { AnnexContext, DocumentFacts } from './context';
import { distinctPeople, legalRepresentativeOf, samePerson } from './people';
import type { RiskEvaluationFacts } from './risk-assessment';
import { type RiskZonesFacts, zonesByPosition } from './risk-zones-record';

export const ssmDutiesTypeKey = 'ssm_duties' as const satisfies DocumentTypeKey;

export type CitedDecision = 'decision_imminent_danger' | 'decision_workers_representative';

/** A decision as the client's documents hold it; a date is null for an uploaded file. */
export type StoredDecision = { number: number | null; issueDate: string | null };

/**
 * `employeeIds` are the current employees of the post the block names, which the template never
 * prints: the database reads them to tell which roles a worker's acknowledgement covers.
 */
type RoleBlock = { people: string; employeeIds: string[] };
type CitingRoleBlock = RoleBlock & { decision: string };

export type DutyAnnexContext = {
  number: number;
  positionId: string;
  position: string;
  /** The post's own instructions, numbered as 3.1 annexes them. */
  instructions: { number: number; title: string }[];
  hasInstructions: boolean;
  equipment: boolean;
  zones: { label: string }[];
  hasZones: boolean;
  /** "la 6 luni", the post's own interval or its category's. */
  trainingInterval: string;
  /**
   * Null when no current employee of the post holds the role. Named apart from the set's own
   * names: docxtemplater looks a null value up again in the outer scope, where `imminentDanger`
   * is decision 1.4's list of people.
   */
  workplaceManagerDuties: RoleBlock | null;
  firstAidDuties: RoleBlock | null;
  imminentDangerDuties: CitingRoleBlock | null;
  workersRepresentativeDuties: CitingRoleBlock | null;
  hasRoles: boolean;
};

type DutiesInput = Pick<
  DocumentFacts,
  | 'issueDate'
  | 'firstDecisionNumber'
  | 'client'
  | 'responsiblePersons'
  | 'jobPositions'
  | 'decisionsInRun'
> & {
  riskZones: RiskZonesFacts;
  riskEvaluations: readonly RiskEvaluationFacts[];
  decisionDocuments: Partial<Record<CitedDecision, StoredDecision>>;
};

/**
 * "nr. 4 SSM din 24.11.2026": while the decision is generated in the same run as document 13, the
 * number and date this run gives it; else the decision as stored. Null while it does not exist:
 * document 13 regenerated alone cannot know the number the decision will take.
 */
function decisionReference(
  stored: StoredDecision | undefined,
  generated: number,
  issueDate: string,
  inRun: boolean
) {
  if (!inRun && !stored) return null;
  const number = inRun ? generated : stored!.number;
  const date = inRun ? issueDate : stored!.issueDate;
  return [number === null ? null : `nr. ${number}`, 'SSM', date && `din ${printedDate(date)}`]
    .filter(Boolean)
    .join(' ');
}

export function dutyAnnexes(
  facts: DutiesInput,
  {
    annexes,
    intervalMonths,
    decisionNumbers,
    workersRepresentativeDecision,
  }: {
    annexes: readonly AnnexContext[];
    intervalMonths: (position: DocumentFacts['jobPositions'][number]) => number;
    decisionNumbers: Record<CitedDecision, number>;
    /** Decision 1.5 is part of the set: without it, there is no text to repeat. */
    workersRepresentativeDecision: boolean;
  }
): DutyAnnexContext[] {
  const legalRepresentative = legalRepresentativeOf(facts);
  const annexByVersion = new Map(annexes.map((annex) => [annex.versionId, annex]));
  const zones = zonesByPosition(facts);
  const decision = (key: CitedDecision) =>
    decisionReference(
      facts.decisionDocuments[key],
      decisionNumbers[key],
      facts.issueDate,
      facts.decisionsInRun?.includes(key) ?? false
    );

  return facts.jobPositions.map((position, index) => {
    // Only someone linked to a current employee of this post: a person designated by name alone
    // holds no post, unless they are the legal representative linked as an employee.
    const holders = (role: SsmDutyRole) => {
      const people = distinctPeople(
        facts.responsiblePersons.filter(
          (person) =>
            (person.currentEmployee ||
              (Boolean(legalRepresentative.employeeId) &&
                isLegalRepresentative(person, legalRepresentative))) &&
            person.roles.includes(role) &&
            position.currentEmployees.some((employee) =>
              samePerson(employee, person, legalRepresentative)
            )
        ),
        legalRepresentative
      );
      if (people.length === 0) return null;
      return {
        people: listed(people.map((person) => person.fullName.trim())),
        employeeIds: position.currentEmployees
          .filter((employee) =>
            people.some((person) => samePerson(employee, person, legalRepresentative))
          )
          .flatMap((employee) => (employee.employeeId ? [employee.employeeId] : [])),
      };
    };
    const citing = (role: SsmDutyRole, key: CitedDecision) => {
      const block = holders(role);
      const reference = decision(key);
      return block === null || reference === null ? null : { ...block, decision: reference };
    };
    const instructions = position.instructions
      .flatMap((module) => {
        const annex = module.domain === 'ssm' ? annexByVersion.get(module.version.id) : undefined;
        return annex ? [{ number: annex.number, title: annex.title }] : [];
      })
      .sort((a, b) => a.number - b.number);
    const positionZones = (zones.get(position.id) ?? []).map((label) => ({ label }));
    const roles = {
      workplaceManagerDuties: holders('workplace_manager'),
      firstAidDuties: holders('first_aid'),
      imminentDangerDuties: citing('imminent_danger', 'decision_imminent_danger'),
      workersRepresentativeDuties: workersRepresentativeDecision
        ? citing('workers_representative', 'decision_workers_representative')
        : null,
    };
    return {
      number: index + 1,
      positionId: position.id,
      position: position.name.trim(),
      instructions,
      hasInstructions: instructions.length > 0,
      equipment: position.equipment.length > 0,
      zones: positionZones,
      hasZones: positionZones.length > 0,
      trainingInterval: trainingIntervalLabel(intervalMonths(position)),
      ...roles,
      hasRoles: Object.values(roles).some((role) => role !== null),
    };
  });
}

// Neither the post's name, its annex's number nor 3.1's numbers, which a module added to another
// post shifts: a post renamed, moved or renumbered has the same duties, and its workers'
// acknowledgements stay current.
const postDuties = (annex: DutyAnnexContext) => ({
  instructions: annex.instructions.map((instruction) => instruction.title).sort(),
  equipment: annex.equipment,
  zones: annex.zones,
  trainingInterval: annex.trainingInterval,
});

/**
 * What a revision of document 13 records of what it printed (ADR 046), from the annexes it was
 * merged with. A role's block is the same on every post, and its fingerprint leaves out the
 * holders and the decision's number and date, which a regeneration may change.
 */
export async function ssmDutiesFingerprints(
  annexes: readonly DutyAnnexContext[]
): Promise<SsmDutiesFingerprints> {
  return {
    annexes: await Promise.all(
      annexes.map(async (annex) => ({
        positionId: annex.positionId,
        fingerprint: await sha256(
          stableJson({ wording: ssmDutiesWording.post, duties: postDuties(annex) })
        ),
      }))
    ),
    roles: await Promise.all(
      ssmDutyRoles.map(async (role) => ({
        role,
        fingerprint: await sha256(stableJson({ role, wording: ssmDutiesWording.roles[role] })),
      }))
    ),
  };
}

export async function dutyFingerprintsOf(
  typeKey: string,
  snapshot: Record<string, unknown>
): Promise<Json | null> {
  if (typeKey !== ssmDutiesTypeKey) return null;
  return ssmDutiesFingerprints((snapshot.dutyAnnexes ?? []) as DutyAnnexContext[]);
}
