import {
  type BillingOverview,
  billingPlans,
  countOf,
  type OrganizationSeats,
} from '@ssm-usor/contracts';

import { currentChoice, hasLiveSubscription, viewOf } from './use-billing';

export interface MemberSeats {
  members: number;
  invitations: number;
  taken: number;
  // Null where nothing limits the users: Enterprise, or no subscription.
  limit: number | null;
  full: boolean;
  upgrade: boolean;
}

// The rule the invite check applies (ADR 029): members and open invitations each hold a place;
// an expired invitation holds none. Profesional is offered only where it adds users: a trial
// already has its ten.
export function memberSeatsOf(seats: OrganizationSeats, canAct: boolean): MemberSeats {
  const taken = seats.members + seats.invitations;
  const { limit } = seats;
  const full = limit !== null && taken >= limit;
  return {
    members: seats.members,
    invitations: seats.invitations,
    taken,
    limit,
    full,
    upgrade:
      full &&
      canAct &&
      seats.canUpgrade &&
      limit !== null &&
      limit < billingPlans.profesional.members,
  };
}

export function seatsOfOverview(overview: BillingOverview): OrganizationSeats {
  const live =
    hasLiveSubscription(overview.subscription) && viewOf(overview.subscription) !== 'readOnly';
  return {
    members: overview.usage.members.used ?? 0,
    invitations: overview.usage.invitations,
    limit: overview.usage.members.limit,
    canUpgrade: live && currentChoice(overview.subscription)?.plan === 'start',
  };
}

export const userNoun = (count: number) => countOf(count, 'utilizator', 'utilizatori');

export const seatsLabel = ({ taken, limit }: MemberSeats) =>
  limit === null ? userNoun(taken) : `${taken} din ${userNoun(limit)}`;

// A specialist sees no invitation rows, so the count names them instead of folding them into a
// number of users larger than the table.
export const membersLabel = ({ members, invitations }: MemberSeats) =>
  [
    countOf(members, 'membru', 'membri'),
    invitations > 0 && countOf(invitations, 'invitație în așteptare', 'invitații în așteptare'),
  ]
    .filter(Boolean)
    .join(' · ');

export const upgradeSearch = { plan: 'profesional' } as const;
