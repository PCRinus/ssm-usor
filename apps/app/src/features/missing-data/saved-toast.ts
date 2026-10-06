import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouter } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';

import { currentWayBack, endWayBack, type WayBack } from './way-back';

export const wayBackToastDuration = 10_000;

const clientSection = {
  documents: 'documents',
  'fire-safety-documents': 'fire-safety-documents',
  'client-contract': 'contract',
} as const;

// A same-page fix on the lead page needs no way back: the contract is right there.
const fixedHere = (pathname: string, { to, clientId }: WayBack) =>
  pathname.startsWith('/organization') ||
  pathname.startsWith('/profile') ||
  (to !== 'lead-contract' &&
    pathname.startsWith(`/clients/${clientId}/`) &&
    !pathname.startsWith(`/clients/${clientId}/${clientSection[to]}`));

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
      action: {
        label:
          wayBack.to === 'documents' || wayBack.to === 'fire-safety-documents'
            ? 'Înapoi la generare'
            : 'Înapoi la contract',
        onClick: back,
      },
    });
  };
}
