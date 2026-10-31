import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageMinus,
  ImageOff,
  LoaderCircle,
  X,
} from 'lucide-react';
import { Fragment, type ReactNode, useCallback, useEffect, useEffectEvent, useState } from 'react';

import { pagesLabel } from './import-format';
import type { SelectedFile } from './upload-selection';
import { type ImportImageFile, isHeic, useImportImage } from './use-import-image';
import { ZoomBar } from './zoom-bar';

export type PreviewPhoto = {
  key: string;
  name: string;
  detail?: string;
  view: ReactNode;
};

export function PhotoPreviewDialog({
  photos,
  current,
  onCurrent,
  onClose,
  onRemove,
}: {
  photos: PreviewPhoto[];
  current: string | null;
  onCurrent: (key: string) => void;
  onClose: () => void;
  onRemove?: (key: string) => void;
}) {
  const index = photos.findIndex((photo) => photo.key === current);
  return (
    <Dialog open={index !== -1} onOpenChange={(open) => !open && onClose()}>
      {index !== -1 && (
        <PreviewContent
          photos={photos}
          index={index}
          onCurrent={onCurrent}
          onClose={onClose}
          onRemove={onRemove}
        />
      )}
    </Dialog>
  );
}

function PreviewContent({
  photos,
  index,
  onCurrent,
  onClose,
  onRemove,
}: {
  photos: PreviewPhoto[];
  index: number;
  onCurrent: (key: string) => void;
  onClose: () => void;
  onRemove?: (key: string) => void;
}) {
  const photo = photos[index]!;
  const step = (to: number) => {
    const next = photos[to];
    if (next) onCurrent(next.key);
  };

  function remove() {
    const next = photos[index + 1] ?? photos[index - 1];
    onRemove?.(photo.key);
    if (next) onCurrent(next.key);
    else onClose();
  }

  const stepBy = useEffectEvent((by: number) => step(index + by));
  // On the window, not the dialog: a step to the last photo disables the button that held the
  // focus, and the focus leaves the dialog with it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      stepBy(event.key === 'ArrowLeft' ? -1 : 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <DialogContent
      data-testid="photo-preview"
      showCloseButton={false}
      className="flex h-svh max-h-svh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100svh-4rem)] sm:max-h-[calc(100svh-4rem)] sm:max-w-[min(1100px,calc(100vw-4rem))] sm:rounded-lg sm:border"
    >
      <div className="flex items-start gap-3 border-b py-3 pr-3 pl-4 sm:pl-5">
        <div className="grid min-w-0 flex-1 gap-0.5 pt-1">
          <DialogTitle className="text-base leading-snug wrap-anywhere">{photo.name}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {photo.detail ?? `Fotografia ${index + 1} din ${photos.length}`}
          </DialogDescription>
        </div>
        <Button variant="ghost" size="icon" aria-label="Închide" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/60"
        data-testid="photo-preview-view"
      >
        <Fragment key={photo.key}>{photo.view}</Fragment>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            data-testid="photo-preview-previous"
            disabled={index === 0}
            onClick={() => step(index - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            <span className="max-sm:sr-only">Fotografia anterioară</span>
          </Button>
          <span
            className="min-w-16 text-center text-sm text-muted-foreground tabular-nums"
            data-testid="photo-preview-position"
          >
            {index + 1} din {photos.length}
          </span>
          <Button
            variant="outline"
            data-testid="photo-preview-next"
            disabled={index >= photos.length - 1}
            onClick={() => step(index + 1)}
          >
            <span className="max-sm:sr-only">Fotografia următoare</span>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onRemove && (
            <Button variant="outline" data-testid="photo-preview-remove" onClick={remove}>
              <ImageMinus aria-hidden="true" />
              Scoate fotografia
            </Button>
          )}
          <Button onClick={onClose}>Închide</Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function PreviewImage({
  source,
  alt,
  fallback,
}: {
  source: string | Blob;
  alt: string;
  fallback?: ReactNode;
}) {
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [failed, setFailed] = useState(false);
  const blobRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || typeof source === 'string') return;
      const objectUrl = URL.createObjectURL(source);
      image.src = objectUrl;
      return () => URL.revokeObjectURL(objectUrl);
    },
    [source]
  );
  if (failed) {
    return fallback ?? <PreviewNote icon={ImageOff} title="Nu am putut arăta fotografia aici" />;
  }
  return (
    <>
      <div className="h-full overflow-auto p-3 sm:p-4">
        <img
          ref={blobRef}
          src={typeof source === 'string' ? source : undefined}
          alt={alt}
          data-testid="photo-preview-image"
          onError={() => setFailed(true)}
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

export function PreviewNote({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ImageOff;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center p-6" data-testid="photo-preview-note">
      <div className="grid max-w-sm justify-items-center gap-2 text-center">
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">{title}</p>
        {children && <p className="text-sm text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}

export function PreviewLoading() {
  return (
    <div className="grid h-full place-items-center" aria-busy="true">
      <LoaderCircle
        className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}

function PdfNote({ pages }: { pages: number | null }) {
  return (
    <PreviewNote icon={FileText} title="PDF-urile nu se pot previzualiza aici">
      {pages !== null && pages > 1 && `Are ${pagesLabel(pages)}. `}
      Fiecare pagină a PDF-ului o citim ca pe o fotografie.
    </PreviewNote>
  );
}

const heicNote = (
  <PreviewNote icon={ImageOff} title="Browserul nu poate arăta fotografiile HEIC">
    Fotografia se încarcă și se citește la fel ca celelalte.
  </PreviewNote>
);

export function LocalPhotoView({ file }: { file: SelectedFile }) {
  if (file.mimeType === 'application/pdf') return <PdfNote pages={file.pages} />;
  return (
    <PreviewImage
      source={file.blob}
      alt={`Fotografia ${file.name}`}
      fallback={isHeic(file.mimeType) ? heicNote : undefined}
    />
  );
}

export function ImportFileView({
  importId,
  file,
}: {
  importId: string;
  file: ImportImageFile & { fileName: string; pageCount: number | null };
}) {
  const { image, drawable, url, failed } = useImportImage(importId, file);
  if (!image) return <PdfNote pages={file.pageCount} />;
  if (!drawable) {
    return (
      <PreviewNote icon={ImageOff} title="Browserul nu poate arăta fotografiile HEIC">
        O arătăm aici după ce pregătim fotografiile pentru citire.
      </PreviewNote>
    );
  }
  if (failed) {
    return (
      <PreviewNote icon={ImageOff} title="Nu am putut deschide fotografia">
        Încearcă din nou peste câteva clipe.
      </PreviewNote>
    );
  }
  if (!url) return <PreviewLoading />;
  return <PreviewImage source={url} alt={`Fotografia ${file.fileName}`} />;
}
