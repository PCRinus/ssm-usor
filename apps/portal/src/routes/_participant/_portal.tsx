import { createFileRoute } from '@tanstack/react-router';

import { PortalShell } from '@/features/participation/portal-shell';

export const Route = createFileRoute('/_participant/_portal')({
  component: PortalShell,
});
