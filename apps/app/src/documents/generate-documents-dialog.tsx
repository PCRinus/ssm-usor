import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';

import { useMe } from '../account/use-me';
import {
  type ApiErrorResponse,
  type ClientDocumentListResponse,
  getGetDocumentReadinessQueryKey,
  getListClientDocumentsQueryKey,
  useGenerateClientDocuments,
  useGetDocumentReadiness,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { DatePicker } from '../components/date-picker';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { dateToIso } from '../lib/dates';
import {
  groupMissing,
  type MissingPlace,
  missingPlaces,
  workersRepresentativesRule,
} from './document-labels';
import {
  generateDocumentsFormSchema,
  type GenerateDocumentsFormValues,
  toGenerateDocumentsRequest,
} from './generate-documents-schema';

export function GenerateDocumentsDialog({
  clientId,
  userId,
  open,
  lastGeneration,
  workersRepresentativeDecisionGenerated,
  onClose,
}: {
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

function PlaceLink({ place, clientId }: { place: MissingPlace; clientId: string }) {
  const label = missingPlaces[place].label;
  const className = 'font-medium text-foreground underline underline-offset-4';
  if (place === 'organization')
    return (
      <Link to="/organization/company" className={className}>
        {label}
      </Link>
    );
  if (place === 'profile')
    return (
      <Link to="/profile" className={className}>
        {label}
      </Link>
    );
  if (place === 'jobPositions')
    return (
      <Link to="/clients/$clientId/job-positions" params={{ clientId }} className={className}>
        {label}
      </Link>
    );
  return (
    <Link to="/clients/$clientId/document-data" params={{ clientId }} className={className}>
      {label}
    </Link>
  );
}

function GenerateDocumentsForm({
  clientId,
  userId,
  lastGeneration,
  workersRepresentativeDecisionGenerated,
  onClose,
}: {
  clientId: string;
  userId: string;
  lastGeneration: ClientDocumentListResponse['lastGeneration'];
  workersRepresentativeDecisionGenerated: boolean;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  // Asked again every time the form opens: the data is filled in on other pages.
  const readiness = useGetDocumentReadiness(clientId, {
    request: apiRequest,
    query: { queryKey: [...getGetDocumentReadinessQueryKey(clientId), userId], staleTime: 0 },
  });
  const generate = useGenerateClientDocuments({ request: apiRequest });
  // Only an owner can fill in the organization's details; a specialist is told whom to ask.
  const isOwner = useMe().data?.membership?.role === 'owner';
  const form = useForm<GenerateDocumentsFormValues>({
    resolver: zodResolver(generateDocumentsFormSchema),
    defaultValues: {
      issueDate: lastGeneration?.issueDate ?? dateToIso(new Date()),
      firstDecisionNumber: String(lastGeneration?.firstDecisionNumber ?? 1),
    },
  });
  const { errors } = form.formState;
  const busy = generate.isPending;
  const missing = readiness.data
    ? groupMissing(
        readiness.data.missing,
        readiness.data.workersRepresentativeClash,
        readiness.data.undecidedJobPositions
      )
    : [];
  const ready = readiness.data?.ready === true;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await generate.mutateAsync({
        clientId,
        data: toGenerateDocumentsRequest(values),
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
              : 'Nu am putut genera documentele. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="generate-documents-dialog" className="sm:max-w-xl">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Generează documentația</DialogTitle>
          <DialogDescription>
            Generăm doar documentele lipsă, ca fișiere Word completate cu datele clientului.
            Documentele existente rămân neschimbate.
          </DialogDescription>
        </DialogHeader>
        {readiness.isPending ? (
          <Skeleton className="mt-5 h-28 w-full" />
        ) : readiness.isError ? (
          <Notice
            variant="destructive"
            className="mt-5"
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
          <Notice variant="info" data-testid="generate-headcount" className="mt-5">
            {workersRepresentativesRule(
              readiness.data.currentEmployeeCount,
              workersRepresentativeDecisionGenerated
            )}
          </Notice>
        )}
        {!readiness.data ? null : !ready ? (
          <div data-testid="generate-missing" className="mt-5 grid gap-3 text-sm">
            <p>
              Documentele nu lasă niciun câmp gol, așa că mai întâi trebuie completate câteva date:
            </p>
            <ul className="grid gap-3">
              {missing.map(({ place, labels }) => (
                <li
                  key={place}
                  data-testid="generate-missing-place"
                  className="rounded-md border p-3"
                >
                  <PlaceLink place={place} clientId={clientId} />
                  <span className="text-muted-foreground">: {labels.join(', ')}.</span>
                  {missingPlaces[place].hint && !(place === 'organization' && isOwner) && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {missingPlaces[place].hint}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
              label="Numărul primei decizii"
              mark="required"
              hint="Deciziile primesc numere consecutive."
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
          <Notice variant="destructive" data-testid="generate-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
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
