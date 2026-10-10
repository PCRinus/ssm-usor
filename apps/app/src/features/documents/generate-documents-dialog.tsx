import { zodResolver } from '@hookform/resolvers/zod';
import type { DocumentSet } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  type ClientDocumentListResponse,
  getGetDocumentReadinessQueryKey,
  getListClientDocumentsQueryKey,
  useGenerateClientDocuments,
  useGetDocumentReadiness,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { useMe } from '@/features/account/use-me';
import { MissingDataList } from '@/features/missing-data/missing-data-list';
import {
  countRows,
  documentMissingGroups,
  missingCountLabel,
} from '@/features/missing-data/missing-rows';
import { startWayBack } from '@/features/missing-data/way-back';
import { dateToIso } from '@/lib/dates';

import { workersRepresentativesRule } from './document-labels';
import { documentSetCopy, setParams } from './document-sets';
import {
  generateDocumentsFormSchema,
  type GenerateDocumentsFormValues,
  toGenerateDocumentsRequest,
} from './generate-documents-schema';

export function GenerateDocumentsDialog({
  set,
  clientId,
  userId,
  open,
  lastGeneration,
  workersRepresentativeDecisionGenerated,
  onClose,
}: {
  set: DocumentSet;
  clientId: string;
  userId: string;
  open: boolean;
  lastGeneration: ClientDocumentListResponse['lastGeneration'];
  workersRepresentativeDecisionGenerated: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && (
        <GenerateDocumentsForm
          set={set}
          clientId={clientId}
          userId={userId}
          lastGeneration={lastGeneration}
          workersRepresentativeDecisionGenerated={workersRepresentativeDecisionGenerated}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function GenerateDocumentsForm({
  set,
  clientId,
  userId,
  lastGeneration,
  workersRepresentativeDecisionGenerated,
  onClose,
}: {
  set: DocumentSet;
  clientId: string;
  userId: string;
  lastGeneration: ClientDocumentListResponse['lastGeneration'];
  workersRepresentativeDecisionGenerated: boolean;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  // Asked again every time the form opens: the data is filled in on other pages.
  const readiness = useGetDocumentReadiness(clientId, setParams(set), {
    request: apiRequest,
    query: {
      queryKey: [...getGetDocumentReadinessQueryKey(clientId, setParams(set)), userId],
      staleTime: 0,
    },
  });
  const occupationalSafety = set === 'occupational_safety';
  const { templatesUnavailable } = documentSetCopy[set];
  const generate = useGenerateClientDocuments({ request: apiRequest });
  // Only an owner can fill in the organization's details; a specialist is told whom to ask.
  const isOwner = useMe().data?.membership?.role === 'owner';
  const form = useForm<GenerateDocumentsFormValues>({
    resolver: zodResolver(generateDocumentsFormSchema(set)),
    defaultValues: {
      issueDate: lastGeneration?.issueDate ?? dateToIso(new Date()),
      firstDecisionNumber: String(lastGeneration?.firstDecisionNumber ?? 1),
    },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = generate.isPending;
  const missing = readiness.data
    ? documentMissingGroups({
        missing: readiness.data.missing,
        clientId,
        clash: readiness.data.workersRepresentativeClash,
        undecidedJobPositions: readiness.data.undecidedJobPositions,
        incompleteRiskEvaluations: readiness.data.incompleteRiskEvaluations,
        canEditOrganization: isOwner,
        set,
      })
    : [];
  // The cached answer predates what was filled in since, so it waits for the one asked above.
  const checking = readiness.isPending || (readiness.isFetching && !readiness.isFetchedAfterMount);
  const ready = !checking && readiness.data?.ready === true;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await generate.mutateAsync({
        clientId,
        data: toGenerateDocumentsRequest(values),
        params: setParams(set),
      });
      await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
      toast.success(
        result.created.length === 1
          ? 'A fost generat un document.'
          : `Au fost generate ${result.created.length} documente.`
      );
      onClose();
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.reason === 'missing_document_data') {
        // Someone changed the data since the form opened: show what is missing now.
        await readiness.refetch();
        return;
      }
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 409
            ? 'Clientul este arhivat, așa că nu i se mai generează documente.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : cause instanceof ApiHttpError && cause.status === 503 && templatesUnavailable
                ? templatesUnavailable
                : 'Nu am putut genera documentele. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent
      data-testid="generate-documents-dialog"
      className="sm:max-w-2xl"
      aria-describedby={undefined}
    >
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Generează documentația</DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 grid gap-5">
          {checking ? (
            <Skeleton className="h-28 w-full" />
          ) : readiness.isError ? (
            <Notice
              variant="destructive"
              action={
                <Button
                  type="button"
                  variant="outline"
                  disabled={readiness.isFetching}
                  onClick={() => void readiness.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut verifica datele clientului.
            </Notice>
          ) : (
            occupationalSafety && (
              <Notice variant="info" data-testid="generate-headcount">
                {workersRepresentativesRule(
                  readiness.data.currentEmployeeCount,
                  workersRepresentativeDecisionGenerated
                )}
              </Notice>
            )
          )}
          {checking || !readiness.data ? null : !ready ? (
            <div data-testid="generate-missing" className="grid gap-4">
              <p className="text-sm">
                <strong data-testid="generate-missing-count" className="font-semibold">
                  {missingCountLabel(countRows(missing))}
                </strong>{' '}
                <span className="text-muted-foreground">
                  înainte de generare: documentele nu lasă niciun câmp gol.
                </span>
              </p>
              <MissingDataList
                groups={missing}
                testId="generate-missing"
                onFollow={() =>
                  startWayBack({
                    userId,
                    clientId,
                    to: occupationalSafety ? 'documents' : 'fire-safety-documents',
                  })
                }
              />
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="generate-issue-date"
                label="Data documentelor"
                mark="required"
                hint="De obicei data de început a contractului."
                error={errors.issueDate}
              >
                <Controller
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <DatePicker
                      id="generate-issue-date"
                      testId="generate-issue-date"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={busy}
                      required
                      invalid={Boolean(errors.issueDate)}
                      describedBy={
                        errors.issueDate ? 'generate-issue-date-error' : 'generate-issue-date-hint'
                      }
                    />
                  )}
                />
              </Field>
              <Field
                id="generate-first-number"
                label={occupationalSafety ? 'Numărul primei decizii' : 'Numărul primei decizii PSI'}
                mark="required"
                hint={
                  occupationalSafety
                    ? 'Deciziile primesc numere consecutive.'
                    : 'Celelalte decizii primesc numere după locul lor în biblioraft.'
                }
                error={errors.firstDecisionNumber}
              >
                <Input
                  id="generate-first-number"
                  data-testid="generate-first-number"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={Boolean(errors.firstDecisionNumber)}
                  aria-describedby={
                    errors.firstDecisionNumber
                      ? 'generate-first-number-error'
                      : 'generate-first-number-hint'
                  }
                  {...form.register('firstDecisionNumber')}
                />
              </Field>
            </div>
          )}
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="generate-error">
              {errors.root.server.message}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {ready ? 'Renunță' : 'Închide'}
          </Button>
          {ready && (
            <Button type="submit" data-testid="generate-submit" disabled={busy}>
              {busy ? 'Se generează…' : 'Generează'}
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
