import { cn } from '@ssm-usor/ui/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { importErrorMessage } from '../import-format';
import { sourceQuery, viewerChunks } from '../source-query';
import { ZoomBar } from '../zoom-bar';
import type { SheetPage } from './employee-review-model';
import { pageFileName } from './review-format';

const PdfSourceView = lazy(viewerChunks.pdf);

export function SheetPageView({
  importId,
  page,
  className,
}: {
  importId: string;
  page: SheetPage;
  className?: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const query = useQuery(sourceQuery(importId, { file: page.label }, apiRequest, queryClient));
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg bg-muted/60', className)}
      data-testid="sheet-page-view"
    >
      {query.isError ? (
        <div className="p-4">
          <Notice variant="destructive">
            {importErrorMessage(query.error, 'Nu am putut deschide fotografia. Încearcă din nou.')}
          </Notice>
        </div>
      ) : !query.data ? (
        <div className="grid h-full min-h-48 place-items-center" aria-busy="true">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : query.data.page !== null ? (
        <Suspense fallback={null}>
          <PdfSourceView
            key={query.data.fileId}
            source={query.data}
            quote={null}
            onShown={() => undefined}
            onNotFound={() => undefined}
          />
        </Suspense>
      ) : (
        <PhotoView source={query.data} name={pageFileName(page)} />
      )}
    </div>
  );
}

function PhotoView({ source, name }: { source: ImportSourceResponse; name: string }) {
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const url = source.derived?.url ?? source.original.url;
  return (
    <>
      <div className="h-full overflow-auto p-3">
        <img
          src={url}
          alt={`Fotografia ${name}`}
          className={cn(
            'mx-auto block bg-card shadow-sm',
            zoom === 'fit' && 'max-h-full max-w-full object-contain'
          )}
          style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%`, maxWidth: 'none' }}
        />
      </div>
      <ZoomBar zoom={zoom} onZoom={setZoom} fit />
    </>
  );
}
