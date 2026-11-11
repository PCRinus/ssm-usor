import { cn } from '@ssm-usor/ui/lib/utils';
import { Expand, FileText } from 'lucide-react';

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

export function EnlargeablePageThumb({
  detail,
  page,
  label,
  onEnlarge,
  testId,
}: {
  detail: ImportDetail;
  page: SheetPage;
  label: string;
  onEnlarge: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onEnlarge}
      className="group/thumb relative block w-fit shrink-0 cursor-zoom-in rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PageThumb detail={detail} page={page} className="h-[4.5rem] w-14" />
      <span
        aria-hidden="true"
        className="absolute right-1 bottom-1 grid size-6 place-items-center rounded-[7px] border bg-card text-foreground shadow-sm transition-colors group-hover/thumb:bg-secondary"
      >
        <Expand className="size-3.5" />
      </span>
    </button>
  );
}
