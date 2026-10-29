import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Eye } from 'lucide-react';
import { useId } from 'react';

import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';

import { type GuideHiddenReason, useSetupGuide } from './setup-guide-context';
import { totalSteps } from './steps';

const hiddenReasons: Record<GuideHiddenReason, string> = {
  'read-only': 'Ghidul nu se arată cât contul e doar pentru citire.',
  impersonation: 'Ghidul nu se arată cât acționezi în locul unui administrator.',
};

export function SetupGuideSection() {
  const { guide, isPending, isError, retry, doneCount, reopen, hiddenBecause } = useSetupGuide();
  const reasonId = useId();

  return (
    <SectionCard data-testid="settings-guides" title="Ghiduri">
      {isError ? (
        <Notice
          variant="destructive"
          action={
            <Button variant="outline" onClick={retry}>
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca ghidul de configurare.
        </Notice>
      ) : isPending || !guide ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div
          data-testid="settings-setup-guide"
          className="flex flex-wrap items-center gap-x-4 gap-y-3"
        >
          <div className="grid min-w-[min(100%,14rem)] flex-1 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Ghid de configurare</span>
              <span
                data-testid="settings-setup-guide-progress"
                className="text-sm text-muted-foreground tabular-nums"
              >
                {doneCount} din {totalSteps}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Pașii prin care pornești: firma, primul client, documentația, instruirea și
              semnăturile.
            </p>
            {hiddenBecause && (
              <p
                id={reasonId}
                data-testid="settings-setup-guide-hidden"
                className="text-sm text-muted-foreground"
              >
                {hiddenReasons[hiddenBecause]}
              </p>
            )}
          </div>
          <Button
            data-testid="settings-setup-guide-show"
            variant="outline"
            size="sm"
            disabled={Boolean(hiddenBecause)}
            aria-describedby={hiddenBecause ? reasonId : undefined}
            onClick={() => reopen('settings')}
          >
            <Eye aria-hidden="true" />
            Arată ghidul
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
