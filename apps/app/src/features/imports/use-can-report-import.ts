import { useMe } from '@/features/account/use-me';

// An admin impersonating a member would raise a support alert in the member's name, so the
// button waits until the account is known not to be one.
export function useCanReportImport() {
  const me = useMe();
  return Boolean(me.data && !me.data.impersonation);
}
