import type { ParticipantChannel, PortalLanguage } from '@ssm-usor/contracts';

export const channelLabels: Record<ParticipantChannel, string> = { email: 'email', sms: 'SMS' };

export const languageLabels: Record<PortalLanguage, string> = { ro: 'română', en: 'engleză' };

const timeFormat = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

export const formatTime = (isoTimestamp: string) => timeFormat.format(new Date(isoTimestamp));
