import { DropdownMenuItem } from '@ssm-usor/ui/components/dropdown-menu';
import type { QueryKey } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { ApiRequestOptions } from '@/api/http';
import { type Disposition, type FileLink, useFileLink } from '@/lib/file-link';

export function FileMenuItem({
  queryKey,
  load,
  apiRequest,
  disposition,
  testId,
  children,
}: {
  queryKey: QueryKey;
  load: (signal: AbortSignal) => Promise<FileLink>;
  apiRequest: ApiRequestOptions;
  disposition: Disposition;
  testId: string;
  children: ReactNode;
}) {
  const link = useFileLink({ queryKey, load, apiRequest, disposition });
  if (!link.href && link.error) {
    return (
      <DropdownMenuItem data-testid={testId} onSelect={() => void link.refetch()}>
        {children}
        <span className="text-xs text-muted-foreground">
          Nu s-a putut pregăti. Încearcă din nou
        </span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild disabled={!link.href} data-testid={testId}>
      <a href={link.href} target={link.target} onClick={(event) => void link.onClick(event)}>
        {children}
      </a>
    </DropdownMenuItem>
  );
}
