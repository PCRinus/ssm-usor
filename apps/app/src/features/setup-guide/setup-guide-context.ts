import type { SetupMemberStepId, SetupStepId } from '@ssm-usor/contracts';
import { createContext, use } from 'react';

import type { SetupGuide } from '@/api/generated/api';

import type { GuideView } from './guide-storage';
import type { StepActionKind } from './steps';

export interface SetupGuideControls {
  guide: SetupGuide | undefined;
  isPending: boolean;
  isError: boolean;
  retry: () => void;
  doneCount: number;
  allDone: boolean;
  // Null while the guide is hidden, waiting, or not decided yet.
  view: GuideView | 'closed' | null;
  phone: boolean;
  isOwner: boolean;
  pendingStep: SetupStepId | undefined;
  expand: () => void;
  collapse: () => void;
  close: () => void;
  reopen: (from: 'pill' | 'settings') => void;
  skip: (step: SetupMemberStepId) => void;
  unskip: (step: SetupMemberStepId) => void;
  follow: (step: SetupStepId, action: StepActionKind) => void;
}

export const SetupGuideContext = createContext<SetupGuideControls | null>(null);

export function useSetupGuide() {
  const context = use(SetupGuideContext);
  if (!context) throw new Error('useSetupGuide needs a SetupGuideProvider.');
  return context;
}
