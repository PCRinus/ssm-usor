import { z } from 'zod';

export const participantChannels = ['email', 'sms'] as const;
export const participantChannelSchema = z.enum(participantChannels);
export type ParticipantChannel = z.infer<typeof participantChannelSchema>;
