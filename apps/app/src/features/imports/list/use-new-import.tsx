import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { openedHere } from '@/app/opener';

import { EmployeeUploadDialog } from '../employees/employee-upload-dialog';
import { ImportUploadDialog } from '../import-upload-dialog';
import { ClientPicker } from './client-picker';
import type { PickedClient } from './use-active-clients';

export type NewImportWay = 'new' | 'complete' | 'employees';

type Flow =
  | { step: 'picking'; way: 'complete' | 'employees' }
  | { step: 'uploading'; way: 'new' }
  | { step: 'uploading'; way: 'complete' | 'employees'; client: PickedClient };

const pickerTitles = {
  complete: 'Client existent din documente',
  employees: 'Lucrători din fișe de instruire',
} as const;

export function useNewImport() {
  const navigate = useNavigate();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [pickerWay, setPickerWay] = useState<'complete' | 'employees'>('complete');
  const close = () => setFlow(null);

  const start = (way: NewImportWay) => {
    if (way === 'new') {
      setFlow({ step: 'uploading', way });
      return;
    }
    setPickerWay(way);
    setFlow({ step: 'picking', way });
  };

  const uploadingClient = flow?.step === 'uploading' && flow.way !== 'employees' ? flow : null;
  const uploadingEmployees =
    flow?.step === 'uploading' && flow.way === 'employees' ? flow.client : null;

  const dialogs = (
    <>
      <ClientPicker
        open={flow?.step === 'picking'}
        title={pickerTitles[pickerWay]}
        onClose={close}
        onPick={(client) => setFlow({ step: 'uploading', way: pickerWay, client })}
      />
      <ImportUploadDialog
        open={uploadingClient !== null}
        client={uploadingClient && 'client' in uploadingClient ? uploadingClient.client : undefined}
        onClose={close}
        onStarted={(importId) =>
          void navigate({
            to: '/clienti/import/$importId',
            params: { importId },
            state: openedHere,
          })
        }
      />
      {uploadingEmployees && (
        <EmployeeUploadDialog
          open
          client={uploadingEmployees}
          onClose={close}
          onStarted={(importId) =>
            void navigate({
              to: '/clienti/$clientId/angajati/import/$importId',
              params: { clientId: uploadingEmployees.id, importId },
              state: openedHere,
            })
          }
          onImportDocumentation={() =>
            setFlow({ step: 'uploading', way: 'complete', client: uploadingEmployees })
          }
        />
      )}
    </>
  );

  return { start, dialogs };
}
