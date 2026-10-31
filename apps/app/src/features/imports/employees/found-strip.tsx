import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { FileText, Image as ImageIcon } from 'lucide-react';

import { getGetClientFileDownloadQueryKey, useGetClientFileDownload } from '@/api/generated/api';

import type { FoundSheet } from './found-sheets';

const drawable = (mimeType: string) => mimeType === 'image/jpeg' || mimeType === 'image/png';

// A link lives a minute; the image loads once from it.
const linkLifeMs = 50_000;

function FoundThumb({ clientId, sheet }: { clientId: string; sheet: FoundSheet }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const show = drawable(sheet.mimeType);
  const link = useGetClientFileDownload(clientId, sheet.clientFileId, {
    request: apiRequest,
    query: {
      queryKey: getGetClientFileDownloadQueryKey(clientId, sheet.clientFileId),
      enabled: show,
      staleTime: linkLifeMs,
    },
  });
  if (show && link.data) {
    return (
      <img
        src={link.data.url}
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
