import { FileClock, History, ScrollText } from 'lucide-react';

export const legislationSections = [
  { to: '/legislatie/documente', label: 'Documente de actualizat', icon: FileClock },
  { to: '/legislatie/modificari', label: 'Modificări', icon: History },
  { to: '/legislatie/acte', label: 'Acte urmărite', icon: ScrollText },
] as const;
