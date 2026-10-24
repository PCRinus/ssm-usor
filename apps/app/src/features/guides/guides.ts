import type { GuideState } from '@ssm-usor/contracts';

// `target` and `phoneTarget` name a `data-tour` attribute; null centres the step on the page.
export interface GuideStep {
  target: string | null;
  // On a phone the sidebar is a modal sheet, which would take the tour's clicks and focus, so a
  // step on a sidebar entry points at the menu button there instead.
  phoneTarget?: string | null;
  title: string;
  body: string;
  phoneBody?: string;
}

export interface Guide {
  id: string;
  // Raising it shows the guide again to everyone who finished or skipped an earlier version.
  version: number;
  title: string;
  description: string;
  path: '/dashboard';
  steps: readonly GuideStep[];
}

export const welcomeGuide: Guide = {
  id: 'welcome',
  version: 1,
  title: 'Turul aplicației',
  description:
    'Patru pași prin locurile de care ai nevoie zilnic: clienții, ce ai de făcut și contul tău.',
  path: '/dashboard',
  steps: [
    {
      target: null,
      title: 'Bun venit în SSM Ușor',
      body: 'Aici ții la zi documentația SSM și PSI a clienților tăi: angajați, instruiri, documente și semnături.',
    },
    {
      target: 'nav-clients',
      phoneTarget: 'menu',
      title: 'Clienții tăi',
      body: 'La Clienți lucrezi pe fiecare firmă: angajații, posturile și documentele ei.',
      phoneBody:
        'Din meniu ajungi la Clienți, unde lucrezi pe fiecare firmă: angajații, posturile și documentele ei.',
    },
    {
      target: 'dashboard-todo',
      title: 'Ce ai de făcut',
      body: 'Aici apare ce așteaptă după tine: semnături de dat, documente de emis și clienți cu date lipsă.',
    },
    {
      target: 'sidebar-footer',
      phoneTarget: 'menu',
      title: 'Setări și noutăți',
      body: 'În meniul contului, la Setări, poți relua oricând acest tur. La Actualizări vezi ce e nou în aplicație.',
      phoneBody:
        'Jos în meniu, la contul tău, găsești Setări, de unde poți relua oricând acest tur. La Actualizări vezi ce e nou în aplicație.',
    },
  ],
};

export const guides: readonly Guide[] = [welcomeGuide];

export type GuideProgress = GuideState['status'] | 'not_started';

export const guideProgressLabels: Record<GuideProgress, string> = {
  not_started: 'Neînceput',
  completed: 'Finalizat',
  skipped: 'Sărit',
};

const stateOf = (guide: Guide, states: readonly GuideState[]) =>
  states.find((state) => state.guide === guide.id);

export function guideProgress(guide: Guide, states: readonly GuideState[]): GuideProgress {
  const state = stateOf(guide, states);
  return state && state.version >= guide.version ? state.status : 'not_started';
}

export const isGuideDue = (guide: Guide, states: readonly GuideState[]) =>
  guideProgress(guide, states) === 'not_started';

export const tourTarget = (name: string) => `[data-tour="${name}"]`;
