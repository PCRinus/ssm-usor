import { currentPrivacyNoticeVersion } from '@ssm-usor/contracts';
import { createContext, useContext } from 'react';

import type { PortalMeResponseParticipationsItem } from '@/api/generated/api';

export type Participation = PortalMeResponseParticipationsItem;

export type ParticipationState = {
  participations: Participation[];
  // Null while an account with several participations has not chosen one.
  participation: Participation | null;
  choose(participantId: string): void;
};

export const ParticipationContext = createContext<ParticipationState | null>(null);

export function useParticipations() {
  const state = useContext(ParticipationContext);
  if (!state) throw new Error('ParticipationContext is missing.');
  return state;
}

export function useParticipation() {
  const { participation } = useParticipations();
  if (!participation) throw new Error('No participation is chosen.');
  return participation;
}

// Versions are dates, so an older one sorts before the current.
export const needsPrivacyNotice = (participation: Participation) =>
  participation.noticeVersion === null || participation.noticeVersion < currentPrivacyNoticeVersion;

export const isAdministrator = (participation: Participation) =>
  participation.kind === 'client_administrator';

export const participationKindLabels: Record<Participation['kind'], string> = {
  employee: 'Angajat',
  client_administrator: 'Administratorul clientului',
};
