import type { KnowledgeTest, TrainingDomain } from '@ssm-usor/contracts';
import { CalendarClock, Flame, HardHat } from 'lucide-react';

export const testBankSections = [
  { to: '/teste/ssm', label: 'SSM la angajare', icon: HardHat, domain: 'ssm', test: 'hiring' },
  {
    to: '/teste/su-la-angajare',
    label: 'SU la angajare',
    icon: Flame,
    domain: 'su',
    test: 'hiring',
  },
  { to: '/teste/su-anual', label: 'SU anual', icon: CalendarClock, domain: 'su', test: 'annual' },
] as const;

export const bankTestLabel = (domain: TrainingDomain, test: KnowledgeTest) =>
  testBankSections.find((section) => section.domain === domain && section.test === test)?.label ??
  '';
