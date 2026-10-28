import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { FileText, Image as ImageIcon } from 'lucide-react';

import { getGetImportSourceQueryKey, useGetImportSource } from '@/api/generated/api';

type ThumbnailFile = {
  uploadPath: string;
  mimeType: string;
  hasDerived: boolean;
};

const heic = (mimeType: string) => mimeType === 'image/heic' || mimeType === 'image/heif';

// The links last five minutes; the query is fetched again before they expire.
const linkLifetimeMs = 4 * 60_000;

// A HEIC photograph is shown only through the JPEG the import makes of it: most browsers cannot
// draw HEIC.
export function ImportThumbnail({
  importId,
  file,
  className,
}: {
  importId: string;
  file: ThumbnailFile;
  className: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const image = file.mimeType.startsWith('image/');
  const drawable = image && (!heic(file.mimeType) || file.hasDerived);
  const params = { file: file.uploadPath };
  const source = useGetImportSource(importId, params, {
    request: apiRequest,
    query: {
      queryKey: getGetImportSourceQueryKey(importId, params),
      enabled: drawable,
      staleTime: linkLifetimeMs,
      refetchInterval: drawable ? linkLifetimeMs : false,
    },
  });
  const url = heic(file.mimeType) ? source.data?.derived?.url : source.data?.original.url;
  if (drawable && url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        data-testid="import-thumbnail"
        className={cn('shrink-0 rounded-md bg-secondary object-cover', className)}
      />
    );
  }
  const Icon = image ? ImageIcon : FileText;
  return (
    <span
      data-testid="import-thumbnail-placeholder"
      className={cn('grid shrink-0 place-items-center rounded-md bg-secondary', className)}
      aria-hidden="true"
    >
      <Icon className="size-4 text-muted-foreground" />
    </span>
  );
}
