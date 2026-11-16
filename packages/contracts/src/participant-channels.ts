import { z } from 'zod';

export const participantChannels = ['email', 'sms'] as const;
export const participantChannelSchema = z.enum(participantChannels);
export type ParticipantChannel = z.infer<typeof participantChannelSchema>;

export const portalLanguages = ['ro', 'en'] as const;

export const portalLanguageSchema = z.enum(portalLanguages);

export type PortalLanguage = z.infer<typeof portalLanguageSchema>;
