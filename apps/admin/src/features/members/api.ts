import type {
  AdminMemberList,
  OrganizationRole,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@ssm-usor/contracts';

import { apiFetch, type ApiRequestOptions } from '@/api/http';

export interface MembersSearch {
  search?: string;
  page?: number;
}

export const maxMemberSearchLength = 100;

export function membersSearchOf(search: Record<string, unknown>): MembersSearch {
  const page = Number(search.page);
  const text =
    typeof search.search === 'string'
      ? search.search.trim().slice(0, maxMemberSearchLength)
      : undefined;
  return {
    search: text || undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export const membersPageSize = 25;

export function fetchMembers(
  search: MembersSearch,
  options: ApiRequestOptions & { signal?: AbortSignal }
) {
  const query = new URLSearchParams({
    page: String(search.page ?? 1),
    pageSize: String(membersPageSize),
  });
  if (search.search) query.set('search', search.search);
  return apiFetch<AdminMemberList>(`/api/members?${query}`, options);
}

export const roleLabels: Record<OrganizationRole, string> = {
  owner: 'Owner',
  specialist: 'Specialist',
};

export const planLabels: Record<SubscriptionPlan, string> = {
  start: 'Start',
  profesional: 'Profesional',
  enterprise: 'Enterprise',
};

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  trialing: 'trial',
  active: 'active',
  past_due: 'past due',
  canceled: 'canceled',
};
