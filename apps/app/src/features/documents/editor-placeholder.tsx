import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function EditorPlaceholder({ back }: { back: ReactNode }) {
  return (
    <div
      data-testid="editor-loading"
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
      aria-busy="true"
    >
      <div className="flex h-12 shrink-0 items-center border-b px-3">{back}</div>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4" aria-hidden="true">
        <Skeleton className="h-5 w-24 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-16 motion-reduce:animate-none" />
        <Skeleton className="hidden h-5 w-32 motion-reduce:animate-none sm:block" />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30 px-4 py-5 sm:px-8">
        <div
          className="mx-auto aspect-[210/297] w-full max-w-[44rem] rounded-sm border bg-card p-7 shadow-sm sm:p-12"
          aria-hidden="true"
        >
          <Skeleton className="mb-10 h-5 w-2/3 motion-reduce:animate-none" />
          <div className="space-y-3">
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-11/12 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-3/4 motion-reduce:animate-none" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border bg-background/95 px-5 py-3 text-sm shadow-sm"
          >
            <LoaderCircle
              data-testid="editor-loading-spinner"
              className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>Se deschide documentul…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
