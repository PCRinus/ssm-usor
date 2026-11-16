import type { ParticipantChannel, PortalAccessState, PortalLanguage } from '@ssm-usor/contracts';

import { formatPhone } from '@/features/imports/phone-diff';

import { channelLabels, formatDay, languageLabels } from './participant-format';

export const portalAccessLabels: Record<PortalAccessState, string> = {
  active: 'Are acces',
  invited: 'Invitat',
  expired: 'Invitație expirată',
  none: 'Fără invitație',
  revoked: 'Acces revocat',
};

interface AccessDates {
  state: PortalAccessState;
  since: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export function accessDateLine({ state, since, expiresAt, revokedAt }: AccessDates) {
  if (state === 'active' && since) return `din ${formatDay(since)}`;
  if (state === 'invited' && expiresAt) return `expiră pe ${formatDay(expiresAt)}`;
  if (state === 'expired' && expiresAt) return `a expirat pe ${formatDay(expiresAt)}`;
  if (state === 'revoked' && revokedAt) return `pe ${formatDay(revokedAt)}`;
  return null;
}

export function channelLine({
  channel,
  language,
  administrator = false,
}: {
  channel: ParticipantChannel;
  language: PortalLanguage | null;
  administrator?: boolean;
}) {
  const parts = [`prin ${channelLabels[channel]}`];
  if (administrator) parts.push('administratorul clientului');
  else if (language) parts.push(`portal în ${languageLabels[language]}`);
  return parts.join(' · ');
}

export interface AccessTarget {
  name: string;
  address: string | null;
  employeeId: string | null;
}

export const shownAddress = (channel: ParticipantChannel, address: string) =>
  channel === 'sms' ? formatPhone(address) : address;
