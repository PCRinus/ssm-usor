import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

export type EditorBadge = {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'warning';
};

export type EditorMainAction =
  | {
      kind: 'button';
      label: string;
      icon: LucideIcon;
      onClick: () => void;
      pending?: boolean;
      testId: string;
    }
  | { kind: 'saved' };

export type EditorMenuItem =
  | { kind: 'navigation' }
  | {
      kind: 'action';
      label: string;
      icon: LucideIcon;
      onSelect: () => void;
      disabled?: boolean;
      testId: string;
    }
  | {
      kind: 'link';
      label: string;
      icon: LucideIcon;
      // The link element itself, given the row's content: a router link keeps its typed route.
      link: (content: ReactNode) => ReactElement;
    };

export interface PhoneBar {
  back: ReactNode;
  title: string;
  heading: string;
  subtitle?: string;
  badges: EditorBadge[];
  status?: { text: string; tone: 'muted' | 'warning' };
  note?: string;
  main: EditorMainAction | null;
  busy?: string;
  items: EditorMenuItem[];
}
