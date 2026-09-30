import type { ClientSortKey } from '@ssm-usor/contracts';

export const leadSortKeys = ['legalName', 'cui'] as const satisfies readonly ClientSortKey[];
export type LeadSortKey = (typeof leadSortKeys)[number];
