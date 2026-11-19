import type { DocumentSet } from '@ssm-usor/contracts';
import { FileClock, FireExtinguisher, History, ScrollText } from 'lucide-react';

export const legislationSections = [
  {
    to: '/legislatie/documente-ssm',
    label: 'Documente SSM de actualizat',
    navLabel: 'SSM de actualizat',
    icon: FileClock,
    set: 'occupational_safety',
  },
  {
    to: '/legislatie/documente-su',
    label: 'Documente SU de actualizat',
    navLabel: 'SU de actualizat',
    icon: FireExtinguisher,
    set: 'fire_safety',
  },
  { to: '/legislatie/modificari', label: 'Modificări', navLabel: 'Modificări', icon: History },
  { to: '/legislatie/acte', label: 'Acte urmărite', navLabel: 'Acte urmărite', icon: ScrollText },
] as const satisfies readonly {
  to: string;
  label: string;
  navLabel: string;
  icon: unknown;
  set?: DocumentSet;
}[];

export const documentsTabOf = (set: DocumentSet) =>
  set === 'fire_safety' ? '/legislatie/documente-su' : '/legislatie/documente-ssm';
