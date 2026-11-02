import { Flame, HardHat } from 'lucide-react';

export const instructionSections = [
  { to: '/instructions/ssm', label: 'IPSSM', icon: HardHat },
  { to: '/instructions/su', label: 'IPSU', icon: Flame },
] as const;
