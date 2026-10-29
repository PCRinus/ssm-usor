import { importErrorReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import {
  BriefcaseBusiness,
  Equal,
  Flame,
  FolderOpen,
  IdCard,
  MapPin,
  RefreshCw,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  type ApiErrorResponse,
  confirmImport,
  getListClientsQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';

import { importErrorMessage } from './import-format';
import { leaveImportNotice } from './import-notice';
import {
  type FieldState,
  formatFieldValue,
  type Proposal,
  refusedValueMessage,
} from './review-model';
import { confirmLines, folderSentence, importFolderCount } from './review-summary';
import type { ImportReview } from './use-import-review';

const icons: Record<string, ReactNode> = {
  pin: <MapPin className="size-4" />,
  briefcase: <BriefcaseBusiness className="size-4" />,
  person: <UserRound className="size-4" />,
  users: <UsersRound className="size-4" />,
  flame: <Flame className="size-4" />,
};

function Line({
  icon,
  count,
  label,
  detail,
}: {
  icon: ReactNode;
  count?: number;
  label: string;
  detail: string;
}) {
  return (
    <li
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3"
      data-testid="confirm-line"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-secondary" aria-hidden="true">
        {icon}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm">
          {count !== undefined && <span className="mr-1 font-semibold tabular-nums">{count}</span>}
          <span className="font-medium">{label}</span>
        </span>
        <span className="text-[13px] text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

const conflictReasons: Record<string, string> = {
  [importErrorReasons.otherCompany]:
    'CUI-ul din documente nu este al acestui client. Verifică identitatea clientului înainte de confirmare.',
  [importErrorReasons.clientExists]:
    'Organizația are deja un client cu acest CUI. Completează-l pe acela din pagina lui, cu „Completează din documentație”.',
  [importErrorReasons.incomplete]:
    'Mai sunt decizii de luat. Reîncarcă pagina ca să vezi ce lipsește.',
  [importErrorReasons.outdated]:
    'Clientul s-a schimbat între timp: un punct de lucru sau un post ales nu mai există. Reîncarcă pagina și alege din nou.',
};

export function ConfirmImportDialog({
  open,
  detail,
  proposal,
  review,
  states,
  name,
  onClose,
}: {
  open: boolean;
  detail: ImportDetail;
  proposal: Proposal;
  review: ImportReview;
  states: Record<string, FieldState>;
  name: string;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = detail.intoExistingClient;
  const { lines, left } = confirmLines(proposal, review.changes);
  const fields = Object.values(states);
  const addedFields = fields.filter((state) => state.comparison === 'added');
  const replaced = fields.filter((state) => state.comparison === 'replaced');
  const kept = fields.filter((state) => state.comparison === 'kept' || state.comparison === 'same');

  async function confirm() {
    setSending(true);
    setError(null);
    try {
      const saved = await review.flush();
      if ('error' in saved) {
        setError(saved.error);
        setSending(false);
        return;
      }
      const result = await confirmImport(detail.id, { version: saved.version }, apiRequest);
      leaveImportNotice(result.clientId, {
        existing,
        files: result.fileCount,
        added: [
          ...addedFields.map((state) => state.label.toLowerCase()),
          ...lines.map((line) => `${line.count ?? ''} ${line.label}`.trim()),
        ],
        changed: replaced.map(
          (state) =>
            `${state.label} e acum ${formatFieldValue(state.path, state.value)}, cum ai ales`
        ),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() }),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            String(queryKey[0]).startsWith(`/clients/${result.clientId}`),
        }),
      ]);
      await navigate({ to: '/clients/$clientId/details', params: { clientId: result.clientId } });
    } catch (cause) {
      const body =
        cause instanceof ApiHttpError
          ? (cause.body as Partial<ApiErrorResponse> | undefined)
          : undefined;
      const reason = body?.reason;
      setError(
        reason === importErrorReasons.refused
          ? refusedValueMessage(body?.issues?.[0])
          : reason && Object.hasOwn(conflictReasons, reason)
            ? conflictReasons[reason]!
            : importErrorMessage(cause, 'Nu am putut confirma importul. Încearcă din nou.')
      );
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent data-testid="import-confirm-dialog" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Completezi clientul ${name}?` : `Creezi clientul ${name}?`}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? 'Preluăm ce ai verificat. Ce avea deja clientul rămâne cum era, în afară de valorile pe care le-ai ales din documente.'
              : 'Preluăm datele pe care le-ai bifat. Le poți modifica oricând din pagina clientului.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4 grid gap-4">
          {existing && (
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Se adaugă
            </h3>
          )}
          <ul className="grid gap-3">
            {existing && addedFields.length > 0 && (
              <Line
                icon={<IdCard className="size-4" />}
                label={addedFields.map((state) => state.label).join(', ')}
                detail="Datele pe care clientul nu le avea"
              />
            )}
            {lines.map((line) => (
              <Line
                key={line.label}
                icon={icons[line.icon]}
                count={line.count}
                label={line.label}
                detail={line.detail}
              />
            ))}
          </ul>
          {existing && replaced.length > 0 && (
            <>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Se schimbă, ales de tine
              </h3>
              <ul className="grid gap-3">
                {replaced.map((state) => (
                  <Line
                    key={state.path}
                    icon={<RefreshCw className="size-4" />}
                    label={state.label}
                    detail={`${formatFieldValue(state.path, state.existing)} devine ${formatFieldValue(state.path, state.value)}`}
                  />
                ))}
              </ul>
            </>
          )}
          {existing && kept.length > 0 && (
            <>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Rămân cum erau
              </h3>
              <ul className="grid gap-3">
                <Line
                  icon={<Equal className="size-4" />}
                  label={kept.map((state) => state.label).join(', ')}
                  detail="Valorile din aplicație"
                />
              </ul>
            </>
          )}
          <div className="grid gap-1 border-t pt-4 text-sm">
            {importFolderCount(detail) > 0 && (
              <p className="flex items-start gap-2">
                <FolderOpen className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{folderSentence(detail)}</span>
              </p>
            )}
            {left > 0 && (
              <p className="text-muted-foreground">
                Nu preluăm {left === 1 ? 'un element' : `cele ${left} elemente`} de la alt client.
              </p>
            )}
          </div>
          {error && (
            <Notice variant="destructive" data-testid="import-confirm-error">
              {error}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button variant="outline" disabled={sending} onClick={onClose}>
            Înapoi la verificare
          </Button>
          <Button
            data-testid="import-confirm-submit"
            disabled={sending}
            onClick={() => void confirm()}
          >
            {sending ? 'Se salvează…' : existing ? 'Completează clientul' : 'Creează clientul'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
