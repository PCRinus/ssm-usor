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
      disabled?: boolean;
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
  // A few words beside the badges, such as whether the draft is saved.
  status?: { text: string; tone: 'muted' | 'warning' };
  // What the badges mean, as a sentence under them.
  note?: string;
  main: EditorMainAction | null;
  items: EditorMenuItem[];
}
