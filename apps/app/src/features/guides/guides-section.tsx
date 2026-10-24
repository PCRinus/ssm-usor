import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Play, RotateCcw } from 'lucide-react';

import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';

import { guideProgress, guideProgressLabels, guides } from './guides';
import { useStartGuide } from './guides-context';
import { useGuideStates } from './use-guides';

export function GuidesSection() {
  const states = useGuideStates();
  const startGuide = useStartGuide();

  return (
    <SectionCard
      data-testid="settings-guides"
      title="Ghiduri"
      description="Tururi scurte prin aplicație. Le poți relua oricând."
    >
      {states.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : states.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={states.isFetching}
              onClick={() => void states.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca ghidurile.
        </Notice>
      ) : (
        <ul className="grid divide-y">
          {guides.map((guide) => {
            const progress = guideProgress(guide, states.data.items);
            return (
              <li
                key={guide.id}
                data-testid={`guide-${guide.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="grid min-w-[min(100%,14rem)] flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{guide.title}</span>
                    <Badge
                      data-testid={`guide-${guide.id}-status`}
                      variant={progress === 'completed' ? 'secondary' : 'outline'}
                    >
                      {guideProgressLabels[progress]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{guide.description}</p>
                </div>
                <Button
                  data-testid={`guide-${guide.id}-replay`}
                  variant="outline"
                  size="sm"
                  onClick={() => startGuide(guide)}
                >
                  {progress === 'not_started' ? (
                    <>
                      <Play aria-hidden="true" />
                      Pornește turul
                    </>
                  ) : (
                    <>
                      <RotateCcw aria-hidden="true" />
                      Reia turul
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
