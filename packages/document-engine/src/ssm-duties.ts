import type { SsmDutyRole } from '@ssm-usor/contracts';

import texts from '../tools/import/ssm-duties.ro.json' with { type: 'json' };

export const ssmDutiesTypeKey = 'ssm_duties';

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
