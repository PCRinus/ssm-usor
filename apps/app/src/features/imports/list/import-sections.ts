import type { ImportKind } from '@ssm-usor/contracts';
import { Briefcase, UsersRound } from 'lucide-react';

export const importSections = [
  { to: '/importuri/clienti', label: 'Clienți', icon: Briefcase, kind: 'client' },
  { to: '/importuri/lucratori', label: 'Lucrători', icon: UsersRound, kind: 'employees' },
] as const satisfies readonly { to: string; label: string; icon: unknown; kind: ImportKind }[];

export const importTabOf = (kind: ImportKind) =>
  kind === 'employees' ? '/importuri/lucratori' : '/importuri/clienti';
