import { documentSetOf } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouter } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { documentRowLink } from '@/features/documents/document-sets';

import { currentWayBack, endWayBack, type WayBack } from './way-back';

export const wayBackToastDuration = 10_000;

function clientSection({ to, typeKey }: WayBack) {
  if (to === 'document') {
    return typeKey && documentSetOf(typeKey) === 'fire_safety'
      ? 'fire-safety-documents'
      : 'documents';
  }
  if (to === 'client-contract') return 'contract';
  return to;
}

// A same-page fix on the lead page needs no way back: the contract is right there.
const fixedHere = (pathname: string, wayBack: WayBack) =>
  pathname.startsWith('/organization') ||
  pathname.startsWith('/profile') ||
  (wayBack.to !== 'lead-contract' &&
    pathname.startsWith(`/clients/${wayBack.clientId}/`) &&
    !pathname.startsWith(`/clients/${wayBack.clientId}/${clientSection(wayBack)}`));

const backLabels = {
  documents: 'Înapoi la generare',
  'fire-safety-documents': 'Înapoi la generare',
  document: 'Înapoi la document',
  'client-contract': 'Înapoi la contract',
  'lead-contract': 'Înapoi la contract',
} as const satisfies Record<WayBack['to'], string>;

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
        void navigate({ to: '/leads/$leadId', params: { leadId: wayBack.clientId } });
      } else if (wayBack.to === 'client-contract') {
        void navigate({
          to: '/clients/$clientId/contract',
          params: { clientId: wayBack.clientId },
        });
      } else if (wayBack.to === 'document' && wayBack.typeKey) {
        void navigate(documentRowLink(wayBack.clientId, wayBack.typeKey));
      } else if (wayBack.to === 'fire-safety-documents') {
        void navigate({
          to: '/clients/$clientId/fire-safety-documents',
          params: { clientId: wayBack.clientId },
          search: { focus: 'generate' },
        });
      } else {
        void navigate({
          to: '/clients/$clientId/documents',
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
