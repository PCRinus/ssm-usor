import { cn } from '@ssm-usor/ui/lib/utils';
import { FileText } from 'lucide-react';

import type { ImportDetail } from '@/api/generated/api';

import { ImportThumbnail } from '../import-thumbnail';
import type { SheetPage } from './employee-review-model';

export function PageThumb({
  detail,
  page,
  className,
}: {
  detail: ImportDetail;
  page: SheetPage;
  className: string;
}) {
  const file = detail.files.find((each) => each.id === page.fileId);
  if (!file || page.page !== null) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center rounded-md bg-secondary', className)}
        aria-hidden="true"
      >
        <FileText className="size-4 text-muted-foreground" />
      </span>
    );
  }
  return <ImportThumbnail importId={detail.id} file={file} className={className} />;
}
