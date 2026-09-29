import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouter } from '@tanstack/react-router';

import { useAuth } from '../auth/auth-context';
import { currentWayBack, endWayBack, type WayBack } from './way-back';

export const wayBackToastDuration = 10_000;

// A same-page fix on the lead page needs no way back: the contract is right there.
const fixedHere = (pathname: string, { to, clientId }: WayBack) =>
  pathname.startsWith('/organization') ||
  pathname.startsWith('/profile') ||
  (to !== 'lead-contract' &&
    pathname.startsWith(`/clients/${clientId}/`) &&
    !pathname.startsWith(`/clients/${clientId}/${to === 'documents' ? 'documents' : 'contract'}`));

export function useSavedToast() {
  const { session } = useAuth();
  const router = useRouter();
  const navigate = useNavigate();

  return (message: string) => {
    const wayBack = currentWayBack(session?.user.id);
    if (!wayBack || !fixedHere(router.state.location.pathname, wayBack)) {
      toast.success(message);
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
      } else {
        void navigate({
          to: '/clients/$clientId/documents',
          params: { clientId: wayBack.clientId },
          search: { focus: 'generate' },
        });
      }
    };
    toast.success(message, {
      duration: wayBackToastDuration,
      action: {
        label: wayBack.to === 'documents' ? 'Înapoi la generare' : 'Înapoi la contract',
        onClick: back,
      },
    });
  };
}
