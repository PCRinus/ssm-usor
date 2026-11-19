import type { ParticipantChannel, PortalLanguage } from '@ssm-usor/contracts';

import { timeFormat } from '@/lib/dates';

export const channelLabels: Record<ParticipantChannel, string> = { email: 'email', sms: 'SMS' };

export const languageLabels: Record<PortalLanguage, string> = { ro: 'română', en: 'engleză' };

export const formatTime = (isoTimestamp: string) => timeFormat.format(new Date(isoTimestamp));
