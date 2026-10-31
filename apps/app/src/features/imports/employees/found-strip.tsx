import { cn } from '@ssm-usor/ui/lib/utils';
import { FileText, Image as ImageIcon, ImageOff } from 'lucide-react';

import { PreviewImage, PreviewLoading, PreviewNote } from '../photo-preview-dialog';
import { type FoundSheet, useFoundSheetUrl } from './found-sheets';

export function FoundThumb({ clientId, sheet }: { clientId: string; sheet: FoundSheet }) {
  const { drawable, url } = useFoundSheetUrl(clientId, sheet);
  if (drawable && url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-[51px] w-10 shrink-0 rounded-sm bg-secondary object-cover"
      />
    );
  }
  const Icon = sheet.mimeType === 'application/pdf' ? FileText : ImageIcon;
  return (
    <span className="grid h-[51px] w-10 shrink-0 place-items-center rounded-sm bg-secondary">
      <Icon className="size-4 text-muted-foreground" />
    </span>
  );
}

export function FoundSheetView({ clientId, sheet }: { clientId: string; sheet: FoundSheet }) {
  const { drawable, url, failed } = useFoundSheetUrl(clientId, sheet);
  if (!drawable) {
    return sheet.mimeType === 'application/pdf' ? (
      <PreviewNote icon={FileText} title="PDF-urile nu se pot previzualiza aici">
        Fiecare pagină a PDF-ului o citim ca pe o fotografie.
      </PreviewNote>
    ) : (
      <PreviewNote icon={ImageOff} title="Browserul nu poate arăta fotografiile HEIC">
        Fotografia se citește la fel ca celelalte.
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
  return <PreviewImage source={url} alt={`Fotografia ${sheet.fileName}`} />;
}

export function FoundStrip({
  clientId,
  sheets,
  shown = 4,
  className,
}: {
  clientId: string;
  sheets: FoundSheet[];
  shown?: number;
  className?: string;
}) {
  const rest = sheets.length - shown;
  return (
    <span className={cn('flex items-center gap-1.5', className)} aria-hidden="true">
      {sheets.slice(0, shown).map((sheet) => (
        <FoundThumb key={sheet.id} clientId={clientId} sheet={sheet} />
      ))}
      {rest > 0 && (
        <span className="grid h-[51px] w-10 place-items-center rounded-sm bg-secondary text-xs font-semibold text-muted-foreground tabular-nums">
          +{rest}
        </span>
      )}
    </span>
  );
}
