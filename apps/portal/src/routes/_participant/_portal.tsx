import { createFileRoute } from '@tanstack/react-router';

import { PortalShell } from '@/app/portal-shell';

export const Route = createFileRoute('/_participant/_portal')({
  component: PortalShell,
});
