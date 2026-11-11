import { documentSetOf } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouter } from '@tanstack/react-router';

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

export function useSavedToast() {
  const { session } = useAuth();
  const router = useRouter();
  const navigate = useNavigate();

  return (message: string, position?: ToastPosition) => {
    const wayBack = currentWayBack(session?.user.id);
    if (!wayBack || !fixedHere(router.state.location.pathname, wayBack)) {
      toast.success(message, { position });
      return;
    }
    const back = () => {
      endWayBack();
      if (wayBack.to === 'lead-contract') {
        void navigate({ to: '/oferte/$leadId', params: { leadId: wayBack.clientId } });
      } else if (wayBack.to === 'client-contract') {
        void navigate({
          to: '/clienti/$clientId/contract',
          params: { clientId: wayBack.clientId },
        });
      } else if (wayBack.to === 'training-sheet' && wayBack.employeeId && wayBack.domain) {
        void navigate({
          to: trainingTabs[wayBack.domain],
          params: { clientId: wayBack.clientId, employeeId: wayBack.employeeId },
        });
      } else if (wayBack.to === 'document' && wayBack.typeKey) {
        void navigate(documentRowLink(wayBack.clientId, wayBack.typeKey));
      } else if (wayBack.to === 'fire-safety-documents') {
        void navigate({
          to: '/clienti/$clientId/documente-su',
          params: { clientId: wayBack.clientId },
          search: { focus: 'generate' },
        });
      } else {
        void navigate({
          to: '/clienti/$clientId/documente-ssm',
          params: { clientId: wayBack.clientId },
          search: { focus: 'generate' },
        });
      }
    };
    toast.success(message, {
      position,
      duration: wayBackToastDuration,
      action: { label: backLabels[wayBack.to], onClick: back },
    });
  };
}
