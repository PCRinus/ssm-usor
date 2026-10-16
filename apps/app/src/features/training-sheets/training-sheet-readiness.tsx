import { type TrainingDomain, trainingDomainLabels } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { useState } from 'react';

import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { MissingDataList } from '@/features/missing-data/missing-data-list';
import {
  missingCountLabel,
  trainingSheetMissingGroups,
} from '@/features/missing-data/missing-rows';
import { startWayBack } from '@/features/missing-data/way-back';

import { useTrainingSheets } from './use-training-sheets';

export function TrainingSheetReadiness({
  clientId,
  employeeId,
  domain,
}: {
  clientId: string;
  employeeId: string;
  domain: TrainingDomain;
}) {
  const { session } = useAuth();
  const readiness = useTrainingSheets(clientId, employeeId);
  const [open, setOpen] = useState(false);
  const sheet = readiness.data?.[domain];
  const label = trainingDomainLabels[domain];

  if (readiness.isError) {
    return (
      <Notice variant="destructive" data-testid={`training-sheet-${domain}-error`}>
        Nu am putut verifica dacă fișa se poate întocmi. Reîncarcă pagina.
      </Notice>
    );
  }
  if (!sheet || sheet.ready) return null;

  const groups = trainingSheetMissingGroups({ missing: sheet.missing, clientId, employeeId });
  return (
    <>
      <Notice
        variant="warning"
        data-testid={`training-sheet-${domain}-missing`}
        action={
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            data-testid={`training-sheet-${domain}-missing-open`}
            onClick={() => setOpen(true)}
          >
            Vezi ce lipsește
          </Button>
        }
      >
        Fișa {label} nu se poate întocmi încă: {missingCountLabel(sheet.missing.length)}.
      </Notice>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="training-sheet-missing-dialog" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ce lipsește pentru fișa {label}</DialogTitle>
            <DialogDescription>
              Fiecare rând te duce la câmpul de completat. După salvare te poți întoarce aici.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            <MissingDataList
              groups={groups}
              testId="training-sheet-missing"
              onFollow={() => {
                startWayBack({
                  userId: session?.user.id ?? '',
                  clientId,
                  to: 'training-sheet',
                  employeeId,
                  domain,
                });
                setOpen(false);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
