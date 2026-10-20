import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';

import { useSensitiveGroupsState } from './use-sensitive-groups-state';

export const noSensitiveGroupsLabel = 'Nu există grupuri sensibile';

export function SensitiveGroupsNoneButton({ clientId }: { clientId: string }) {
  const { declare, pending } = useSensitiveGroupsState(clientId);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="sensitive-groups-none"
      disabled={pending}
      onClick={async () => {
        const failure = await declare('none');
        if (failure) toast.error(failure);
      }}
    >
      {noSensitiveGroupsLabel}
    </Button>
  );
}
