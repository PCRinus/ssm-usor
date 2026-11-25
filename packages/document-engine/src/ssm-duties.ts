import type { SsmDutyRole } from '@ssm-usor/contracts';

import texts from '../tools/import/ssm-duties.ro.json' with { type: 'json' };

export const ssmDutiesTypeKey = 'ssm_duties';

/** One worker's copy of their post's annex of document 13, which they sign (ADR 046). */
export const dutiesAcknowledgementTypeKey = 'duties_acknowledgement';

const { roles, ...post } = texts.annex.wording;

/**
 * The fixed wording of an annex of document 13 (ADR 046), which its template is built from: what
 * every post's annex says, and each role's block. A change to either changes the fingerprints a
 * revision records, so an acknowledgement signed on the old wording shows as out of date.
 */
export const ssmDutiesWording: { post: unknown; roles: Record<SsmDutyRole, unknown> } = {
  post,
  roles: {
    workplace_manager: roles.workplace_manager,
    first_aid: roles.first_aid,
    imminent_danger: roles.imminent_danger,
    workers_representative: roles.workers_representative,
  },
};

type PrintedRoleBlock = { people: string; decision?: string } | null;

/** An annex as a revision of document 13 printed it, in its snapshot's `dutyAnnexes`. */
export type PrintedDutyAnnex = {
  number: number;
  positionId: string;
  position: string;
  instructions: { number: number; title: string }[];
  hasInstructions: boolean;
  equipment: boolean;
  zones: { label: string }[];
  hasZones: boolean;
  trainingInterval: string;
  workplaceManagerDuties: PrintedRoleBlock;
  firstAidDuties: PrintedRoleBlock;
  imminentDangerDuties: PrintedRoleBlock;
  workersRepresentativeDuties: PrintedRoleBlock;
};

export type DutiesAcknowledgementFacts = {
  branding: boolean;
  /** As the revision printed it: "24.11.2026". */
  issueDate: string;
  client: { legalName: string };
  employee: { name: string };
  annex: PrintedDutyAnnex;
  /** The roles the revision gives this worker. */
  roles: readonly SsmDutyRole[];
};

const roleBlocks = {
  workplace_manager: 'workplaceManagerDuties',
  first_aid: 'firstAidDuties',
  imminent_danger: 'imminentDangerDuties',
  workers_representative: 'workersRepresentativeDuties',
} as const satisfies Record<SsmDutyRole, keyof PrintedDutyAnnex>;

/**
 * The merge data of the acknowledgement sheet: the annex as the revision printed it, with only
 * the role blocks the worker holds, each naming the worker alone.
 */
export function buildDutiesAcknowledgementData({
  branding,
  issueDate,
  client,
  employee,
  annex,
  roles,
}: DutiesAcknowledgementFacts) {
  const blocks = Object.fromEntries(
    Object.entries(roleBlocks).map(([role, key]) => {
      const printed = annex[key];
      const held = printed !== null && roles.includes(role as SsmDutyRole);
      return [
        key,
        held
          ? { people: employee.name, ...(printed.decision ? { decision: printed.decision } : {}) }
          : null,
      ];
    })
  ) as Record<(typeof roleBlocks)[SsmDutyRole], PrintedRoleBlock>;
  return {
    branding,
    issueDate,
    client: { legalName: client.legalName },
    employee: { name: employee.name },
    number: annex.number,
    position: annex.position,
    instructions: annex.instructions,
    hasInstructions: annex.hasInstructions,
    equipment: annex.equipment,
    zones: annex.zones,
    hasZones: annex.hasZones,
    trainingInterval: annex.trainingInterval,
    ...blocks,
    hasRoles: Object.values(blocks).some((block) => block !== null),
  };
}
