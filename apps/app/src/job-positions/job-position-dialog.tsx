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
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getListJobPositionsQueryKey,
  useCreateJobPosition,
  useUpdateJobPosition,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import {
  emptyJobPositionForm,
  type JobPosition,
  jobPositionFormSchema,
  type JobPositionFormValues,
  staffCategoryLabels,
  toJobPositionForm,
  toJobPositionRequest,
} from './job-position-schema';

// `null` is closed, 'new' adds a position, and a position edits it.
export type JobPositionEditing = JobPosition | 'new' | null;

export function JobPositionDialog({
  clientId,
  editing,
  onClose,
}: {
  clientId: string;
  editing: JobPositionEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <JobPositionForm
          key={editing === 'new' ? 'new' : editing.id}
          clientId={clientId}
          position={editing === 'new' ? null : editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function JobPositionForm({
  clientId,
  position,
  onClose,
}: {
  clientId: string;
  position: JobPosition | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateJobPosition({ request: apiRequest });
  const update = useUpdateJobPosition({ request: apiRequest });
  const form = useForm<JobPositionFormValues>({
    resolver: zodResolver(jobPositionFormSchema),
    defaultValues: position ? toJobPositionForm(position) : emptyJobPositionForm,
  });
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toJobPositionRequest(values);
    try {
      if (position) await update.mutateAsync({ clientId, jobPositionId: position.id, data });
      else await create.mutateAsync({ clientId, data });
      await queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) });
      toast.success(
        position ? 'Postul de lucru a fost salvat.' : 'Postul de lucru a fost adăugat.'
      );
      onClose();
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.reason === 'job_position_name_taken') {
        form.setError('name', {
          message:
            'Clientul are deja un post cu această denumire. Dacă munca diferă, deosebește-le prin nume: „Manager magazin – birou”.',
        });
        return;
      }
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Postul de lucru nu mai există la acest client.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva postul de lucru. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="job-position-dialog" className="sm:max-w-lg">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {position ? 'Modifică postul de lucru' : 'Adaugă un post de lucru'}
          </DialogTitle>
          <DialogDescription>
            Postul este munca așa cum o vede securitatea muncii, cu riscurile, echipamentul și
            instruirea ei. Funcția din contract rămâne la fiecare angajat
            {position ? ' și nu se schimbă dacă redenumești postul.' : '.'}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field id="job-position-name" label="Denumire" error={errors.name}>
            <Input
              id="job-position-name"
              data-testid="job-position-name"
              autoComplete="off"
              placeholder="Sudor, Lucrător comercial, Contabil…"
              disabled={busy}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'job-position-name-error' : undefined}
              {...form.register('name')}
            />
          </Field>
          <Field
            id="job-position-category"
            label="Categorie de personal"
            hint="Hotărăște la ce interval se face instruirea periodică, după decizia de instruire."
          >
            <NativeSelect
              id="job-position-category"
              data-testid="job-position-category"
              disabled={busy}
              aria-describedby="job-position-category-hint"
              className="w-full"
              {...form.register('staffCategory')}
            >
              <NativeSelectOption value="execution">
                {staffCategoryLabels.execution}
              </NativeSelectOption>
              <NativeSelectOption value="technical_administrative">
                {staffCategoryLabels.technical_administrative}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field
            id="job-position-zone"
            label="Zona de lucru (opțional)"
            error={errors.workZone}
            hint="Felul locului, nu o adresă: „Birou”, „Atelier, teren”, „Gelaterie”."
          >
            <Input
              id="job-position-zone"
              data-testid="job-position-zone"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.workZone)}
              aria-describedby={
                errors.workZone ? 'job-position-zone-error' : 'job-position-zone-hint'
              }
              {...form.register('workZone')}
            />
          </Field>
          <Field
            id="job-position-activities"
            label="Activități desfășurate (opțional)"
            error={errors.activities}
            hint="Ce face efectiv omul de pe acest post. Deosebește două posturi cu nume apropiate."
          >
            <Textarea
              id="job-position-activities"
              data-testid="job-position-activities"
              rows={4}
              disabled={busy}
              aria-invalid={Boolean(errors.activities)}
              aria-describedby={
                errors.activities ? 'job-position-activities-error' : 'job-position-activities-hint'
              }
              {...form.register('activities')}
            />
          </Field>
        </div>
        {errors.root?.server && (
          <p
            data-testid="job-position-error"
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="job-position-save" disabled={busy}>
            {busy ? 'Se salvează…' : position ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
