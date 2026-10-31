import { useState } from 'react';

import { BulkInviteDialog } from './bulk-invite-dialog';

export function useBulkInvite(clientId: string) {
  const [importId, setImportId] = useState<string | null>(null);
  return {
    openBulkInvite: (id: string) => setImportId(id),
    bulkInviteDialog: importId ? (
      <BulkInviteDialog
        clientId={clientId}
        importId={importId}
        open
        onClose={() => setImportId(null)}
      />
    ) : null,
  };
}
