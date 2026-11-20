import type {
  ClientParticipantsResponseParticipantsItem,
  ParticipantInvitationResponse,
} from '@/api/generated/api';

export type PendingInvitation = ParticipantInvitationResponse;
export type ActiveParticipant = ClientParticipantsResponseParticipantsItem;

export type ParticipantMessage = { variant: 'destructive' | 'warning'; text: string } | null;
