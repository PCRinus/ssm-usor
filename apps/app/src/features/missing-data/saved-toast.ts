import { documentSetOf } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { linkOptions, useNavigate, useRouter } from '@tanstack/react-router';

import { keepOpener, stepsBackToOpener } from '@/app/opener';
import { useAuth } from '@/features/auth/auth-context';
import { documentRowLink } from '@/features/documents/document-sets';

import { currentWayBack, endWayBack, type WayBack } from './way-back';

export const wayBackToastDuration = 10_000;

function clientSection({ to, typeKey }: WayBack) {
  if (to === 'document') {
    return typeKey && documentSetOf(typeKey) === 'fire_safety' ? 'documente-su' : 'documente-ssm';
  }
  if (to === 'fire-safety-documents') return 'documente-su';
  if (to === 'documents') return 'documente-ssm';
  if (to === 'client-contract') return 'contract';
  return to;
}

// A same-page fix on the lead page needs no way back: the contract is right there.
const fixedHere = (pathname: string, wayBack: WayBack) =>
  wayBack.to === 'training-sheet'
    ? pathname === `/clienti/${wayBack.clientId}/angajati/${wayBack.employeeId}/editare`
    : pathname.startsWith('/organizatie') ||
      pathname.startsWith('/profil') ||
      (wayBack.to !== 'lead-contract' &&
        pathname.startsWith(`/clienti/${wayBack.clientId}/`) &&
        !pathname.startsWith(`/clienti/${wayBack.clientId}/${clientSection(wayBack)}`));

const backLabels = {
  documents: 'Înapoi la generare',
  'fire-safety-documents': 'Înapoi la generare',
  document: 'Înapoi la document',
  'client-contract': 'Înapoi la contract',
  'lead-contract': 'Înapoi la contract',
  'training-sheet': 'Înapoi la fișă',
} as const satisfies Record<WayBack['to'], string>;

const trainingTabs = {
  ssm: '/clienti/$clientId/angajati/$employeeId/instruire/ssm',
  su: '/clienti/$clientId/angajati/$employeeId/instruire/su',
} as const;

type ToastPosition = NonNullable<NonNullable<Parameters<typeof toast.success>[1]>['position']>;

type SavedToastOptions = { position?: ToastPosition; returning?: boolean };

function wayBackTarget(wayBack: WayBack) {
  if (wayBack.to === 'lead-contract') {
    return linkOptions({ to: '/oferte/$leadId', params: { leadId: wayBack.clientId } });
  }
  if (wayBack.to === 'client-contract') {
    return linkOptions({
      to: '/clienti/$clientId/contract',
      params: { clientId: wayBack.clientId },
    });
  }
  if (wayBack.to === 'training-sheet' && wayBack.employeeId && wayBack.domain) {
    return linkOptions({
      to: trainingTabs[wayBack.domain],
      params: { clientId: wayBack.clientId, employeeId: wayBack.employeeId },
    });
  }
  if (wayBack.to === 'document' && wayBack.typeKey) {
    return documentRowLink(wayBack.clientId, wayBack.typeKey);
  }
  if (wayBack.to === 'fire-safety-documents') {
    return linkOptions({
      to: '/clienti/$clientId/documente-su',
      params: { clientId: wayBack.clientId },
      search: { focus: 'generate' },
    });
  }
  return linkOptions({
    to: '/clienti/$clientId/documente-ssm',
    params: { clientId: wayBack.clientId },
    search: { focus: 'generate' },
  });
}

export function useSavedToast() {
  const { session } = useAuth();
  const router = useRouter();
  const navigate = useNavigate();

  const stepsToStart = (wayBack: WayBack, target: ReturnType<typeof wayBackTarget>) => {
    const state = router.history.location.state;
    const { from } = wayBack;
    if (!from || state.opener !== from.index) return null;
    if (router.buildLocation(target).pathname !== from.pathname) return null;
    return stepsBackToOpener(state);
  };

  // `returning`: the caller goes back to its opener right after, which may be the trip's start.
  return (message: string, { position, returning = false }: SavedToastOptions = {}) => {
    const wayBack = currentWayBack(session?.user.id);
    if (!wayBack || !fixedHere(router.state.location.pathname, wayBack)) {
      toast.success(message, { position });
      return;
    }
    const target = wayBackTarget(wayBack);
    if (returning && stepsToStart(wayBack, target) !== null) {
      endWayBack();
      toast.success(message, { position });
      return;
    }
    const back = () => {
      endWayBack();
      const steps = stepsToStart(wayBack, target);
      if (steps === null) {
        void navigate({ ...target, state: keepOpener });
        return;
      }
      // Back to the entry it left from, then its address again, which reopens what the trip
      // left open there.
      const stop = router.subscribe('onResolved', () => {
        stop();
        void navigate({ ...target, state: keepOpener, replace: true, resetScroll: false });
      });
      router.history.go(steps);
    };
    toast.success(message, {
      position,
      duration: wayBackToastDuration,
      action: { label: backLabels[wayBack.to], onClick: back },
    });
  };
}
