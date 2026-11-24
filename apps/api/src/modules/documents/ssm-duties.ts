import {
  printedDate,
  type SsmDutiesFingerprints,
  type SsmDutyRole,
  ssmDutyRoles,
  trainingIntervalLabel,
} from '@ssm-usor/contracts';
import { ssmDutiesWording } from '@ssm-usor/document-engine';

import { sha256 } from '../../lib/hash';
import { stableJson } from '../../lib/json';
import { listed } from '../../lib/romanian';
import type { AnnexContext, DocumentFacts } from './context';
import { distinctPeople, legalRepresentativeOf, samePerson } from './people';
import type { RiskEvaluationFacts } from './risk-assessment';
import { type RiskZonesFacts, zonesByPosition } from './risk-zones-record';

export { ssmDutiesTypeKey } from '@ssm-usor/document-engine';

export type CitedDecision = 'decision_imminent_danger' | 'decision_workers_representative';

/** A decision as the client's documents hold it; a date is null for an uploaded file. */
export type StoredDecision = { number: number | null; issueDate: string | null };

type RoleBlock = { people: string };
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
  /** Null when no current employee of the post holds the role. */
  workplaceManager: RoleBlock | null;
  firstAid: RoleBlock | null;
  imminentDanger: CitingRoleBlock | null;
  workersRepresentative: CitingRoleBlock | null;
  hasRoles: boolean;
};

type DutiesInput = Pick<
  DocumentFacts,
  'issueDate' | 'firstDecisionNumber' | 'client' | 'responsiblePersons' | 'jobPositions'
> & {
  riskZones: RiskZonesFacts;
  riskEvaluations: readonly RiskEvaluationFacts[];
  decisionDocuments: Partial<Record<CitedDecision, StoredDecision>>;
};

/**
 * "nr. 4 SSM din 24.11.2026": the decision as stored, or, while it is being generated in the same
 * run as document 13, the number and date this generation gives it.
 */
function decisionReference(
  stored: StoredDecision | undefined,
  generated: number,
  issueDate: string
) {
  const number = stored ? stored.number : generated;
  const date = stored ? stored.issueDate : issueDate;
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
    decisionReference(facts.decisionDocuments[key], decisionNumbers[key], facts.issueDate);

  return facts.jobPositions.map((position, index) => {
    // Only someone linked to a current employee of this post: a person designated by name alone
    // holds no post.
    const holders = (role: SsmDutyRole) => {
      const people = distinctPeople(
        facts.responsiblePersons.filter(
          (person) =>
            person.currentEmployee &&
            person.roles.includes(role) &&
            position.currentEmployees.some((employee) =>
              samePerson(employee, person, legalRepresentative)
            )
        ),
        legalRepresentative
      );
      return people.length === 0 ? null : listed(people.map((person) => person.fullName.trim()));
    };
    const block = (role: SsmDutyRole) => {
      const people = holders(role);
      return people === null ? null : { people };
    };
    const citing = (role: SsmDutyRole, key: CitedDecision) => {
      const people = holders(role);
      return people === null ? null : { people, decision: decision(key) };
    };
    const instructions = position.instructions
      .flatMap((module) => {
        const annex = module.domain === 'ssm' ? annexByVersion.get(module.version.id) : undefined;
        return annex ? [{ number: annex.number, title: annex.title }] : [];
      })
      .sort((a, b) => a.number - b.number);
    const positionZones = (zones.get(position.id) ?? []).map((label) => ({ label }));
    const roles = {
      workplaceManager: block('workplace_manager'),
      firstAid: block('first_aid'),
      imminentDanger: citing('imminent_danger', 'decision_imminent_danger'),
      workersRepresentative: workersRepresentativeDecision
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

// Neither the post's name nor its annex's number: a post renamed or moved in the table has the
// same duties, and its workers' acknowledgements stay current.
const postDuties = (annex: DutyAnnexContext) => ({
  instructions: annex.instructions,
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
