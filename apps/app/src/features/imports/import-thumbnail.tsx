import { cn } from '@ssm-usor/ui/lib/utils';
import { FileText, Image as ImageIcon } from 'lucide-react';

import { type ImportImageFile, useImportImage } from './use-import-image';

export function ImportThumbnail({
  importId,
  file,
  className,
}: {
  importId: string;
  file: ImportImageFile;
  className: string;
}) {
  const { image, drawable, url } = useImportImage(importId, file);
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
