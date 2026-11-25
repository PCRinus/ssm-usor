import { fileAddress, linkTarget } from '@ssm-usor/api-http/file-link';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';

import { useApi } from '@/api/use-api';
import { Masked } from '@/components/replay';
import { summaryQuiet } from '@/features/clients/details/summary-list';

import { useEmployeeFiles } from './agreement-scan';

// The scans are the employee's files; the list carries each one's signed link.
export function ScanLink({
  clientId,
  employeeId,
  fileId,
  testId,
  label,
}: {
  clientId: string;
  employeeId: string;
  fileId: string;
  testId: string;
  label?: string;
}) {
  const { request } = useApi();
  const files = useEmployeeFiles(clientId, employeeId);
  const file = files.data?.items.find((item) => item.id === fileId);
  if (files.isPending) return <Skeleton className="h-5 w-48" />;
  if (!file || !request.baseUrl) {
    return (
      <span data-testid={testId} className={cn('font-normal', summaryQuiet)}>
        Scan atașat
      </span>
    );
  }
  const disposition = file.link.disposition === 'inline' ? 'inline' : 'attachment';
  return (
    <a
      data-testid={testId}
      href={fileAddress(request.baseUrl, file.link, disposition)}
      target={linkTarget(disposition)}
      className="underline decoration-border underline-offset-4 hover:decoration-current"
    >
      {label ?? <Masked>{file.name}</Masked>}
    </a>
  );
}
