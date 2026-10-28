import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Progress } from '@ssm-usor/ui/components/progress';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, LoaderCircle, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';

import {
  getListImportsQueryKey,
  type ImportDetail,
  type ImportListResponseItemsItem,
  useListImports,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

import { filesLabel, isRunning, isUploadUnderway, uploadName } from './import-format';
import { useImport } from './use-import';

type ImportItem = ImportListResponseItemsItem;

export function ImportListCard() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const imports = useListImports(undefined, {
    request: apiRequest,
    query: {
      queryKey: [...getListImportsQueryKey(), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const items = (imports.data?.items ?? []).filter((item) => item.kind === 'client');
  if (items.length === 0) return null;
  return (
    <Card
      className="gap-0 overflow-hidden py-0"
      data-testid="import-list"
      aria-labelledby="import-list-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-1.5">
        <h2 id="import-list-heading" className="text-base font-semibold">
          Importuri din documente
        </h2>
        <span className="text-sm text-muted-foreground">
          Rămân aici până creezi clientul sau renunți
        </span>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <ImportListRow key={item.id} item={item} />
        ))}
      </ul>
    </Card>
  );
}

function blockersText(detail: ImportDetail) {
  const choices = detail.blockers.filter((blocker) => blocker.code === 'choice').length;
  const rest = detail.blockers.length - choices;
  const parts = [
    choices === 1 ? 'o alegere' : choices > 1 ? `${choices} alegeri` : null,
    rest === 1 ? 'o dată obligatorie' : rest > 1 ? `${rest} date obligatorii` : null,
  ].filter(Boolean);
  if (parts.length === 0) return 'Totul e pregătit pentru creare.';
  return `${parts.join(' și ')} te așteaptă.`;
}

const stepNames: Record<string, string> = {
  preparing: 'Pregătim fișierele',
  sorting: 'Le sortăm',
  reading: 'Citim documentația',
  checking: 'Verificăm datele',
};

const stepIndex = ['preparing', 'sorting', 'reading', 'checking'];

function progressOf(detail: ImportDetail | undefined, status: string) {
  const step = stepIndex.indexOf(status);
  if (!detail || step === -1) return { value: 0, label: stepNames[status] ?? '' };
  if (status === 'preparing') {
    const done = detail.files.filter((file) => file.state !== 'uploaded').length;
    return {
      value: (done / Math.max(1, detail.files.length)) * 25,
      label: `Pas 1 din 4: ${done} din ${filesLabel(detail.files.length)} pregătite`,
    };
  }
  return { value: step * 25 + 12, label: `Pas ${step + 1} din 4: ${stepNames[status]}` };
}

function ImportListRow({ item }: { item: ImportItem }) {
  const detailQuery = useImport(item.id);
  const detail = detailQuery.data?.import;
  const status = detail?.status ?? item.status;
  const name =
    item.client?.legalName ??
    detail?.companyName ??
    item.companyName ??
    (detail ? uploadName(detail.files) : 'Import din documente');
  useReadyToast(item.id, name, status, Boolean(item.client));

  const link = (label: string, primary = false) => (
    <Button asChild size="sm" variant={primary ? 'default' : 'outline'}>
      <Link
        to="/clients/import/$importId"
        params={{ importId: item.id }}
        data-testid="import-list-open"
      >
        {label}
      </Link>
    </Button>
  );

  let icon = <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />;
  let body = null;
  let action = link('Vezi fișierele');
  if (status === 'ready') {
    icon = <CircleCheck className="size-5" aria-hidden="true" />;
    body = (
      <span className="text-sm text-muted-foreground">
        Propunere gata de verificat.
        {detail && (
          <>
            {' '}
            {filesLabel(detail.files.filter((file) => file.state === 'read').length)} citite,{' '}
            {blockersText(detail)}
          </>
        )}
      </span>
    );
    action = link('Verifică propunerea', true);
  } else if (status === 'failed') {
    icon = <CircleAlert className="size-5" aria-hidden="true" />;
    body = (
      <span className="text-sm text-muted-foreground">
        {item.failureReason ?? 'Importul s-a oprit din cauza unei erori.'}
      </span>
    );
  } else if (status === 'uploading') {
    icon = <Upload className="size-5" aria-hidden="true" />;
    body = (
      <span className="text-sm text-muted-foreground">
        {isUploadUnderway(detail ?? item)
          ? 'Fișierele se încarcă.'
          : 'Încărcarea nu s-a terminat, așa că citirea n-a pornit.'}
      </span>
    );
    action = link('Vezi importul');
  } else if (isRunning(status)) {
    const progress = progressOf(detail, status);
    body = (
      <span className="flex flex-wrap items-center gap-3">
        <Progress
          value={progress.value}
          className="h-1.5 w-full max-w-56"
          aria-label={progress.label}
        />
        <span className="text-sm text-muted-foreground tabular-nums">{progress.label}</span>
      </span>
    );
  }

  return (
    <li
      data-testid="import-list-row"
      data-status={status}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-5 py-3.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-lg',
          status === 'ready'
            ? 'bg-success text-success-foreground'
            : status === 'failed'
              ? 'bg-destructive-soft text-destructive-foreground'
              : 'bg-secondary'
        )}
      >
        {icon}
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="truncate font-semibold">{name}</span>
        {item.client && (
          <span className="text-xs text-muted-foreground">Completare din documentație</span>
        )}
        {body}
      </span>
      <span className="col-start-2 sm:col-start-auto">{action}</span>
    </li>
  );
}

// Announced once, when the reading finishes while the list is open, never for one ready before.
function useReadyToast(importId: string, name: string, status: string, existing: boolean) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const previous = useRef(status);
  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was === status || !isRunning(was)) return;
    void queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
    if (status !== 'ready') return;
    toast.success(`Propunerea pentru ${name} e gata.`, {
      description: existing
        ? 'Verifică datele înainte să completezi clientul.'
        : 'Verifică datele înainte să creezi clientul.',
      action: {
        label: 'Verifică propunerea',
        onClick: () => void navigate({ to: '/clients/import/$importId', params: { importId } }),
      },
    });
  }, [status, name, existing, importId, navigate, queryClient]);
}
