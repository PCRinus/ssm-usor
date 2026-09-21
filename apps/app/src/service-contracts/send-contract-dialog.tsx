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
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  type ApiErrorResponse,
  type ServiceContractResponse,
  useSendServiceContract,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';

const schema = z.object({
  to: z
    .string()
    .trim()
    .min(1, 'Introdu adresa la care trimiți contractul.')
    .refine((value) => z.email().safeParse(value).success, 'Introdu o adresă de email validă.'),
  note: z.string().trim().max(1000, 'Mesajul are cel mult 1000 de caractere.'),
});
type Values = z.infer<typeof schema>;

export function SendContractDialog({
  clientId,
  clientName,
  contactEmail,
  revision,
  open,
  onClose,
  onSent,
}: {
  clientId: string;
  clientName: string;
  contactEmail: string | null;
  revision: number;
  open: boolean;
  onClose: () => void;
  onSent: (response: ServiceContractResponse) => Promise<void>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const send = useSendServiceContract({ request: apiRequest });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { to: contactEmail ?? '', note: '' },
  });
  const { errors } = form.formState;

  function close() {
    form.reset();
    onClose();
  }

  const onSubmit = form.handleSubmit(async ({ to, note }) => {
    try {
      const response = await send.mutateAsync({ clientId, data: { to, note: note || null } });
      await onSent(response);
      toast.success(`Contractul a fost trimis la ${to}.`);
      close();
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      form.setError('root.server', {
        message:
          body?.reason === 'contract_pdf_missing'
            ? 'Contractul emis nu are PDF, așa că nu poate fi trimis de aici. Descarcă-l și trimite-l din emailul tău.'
            : body?.reason === 'contract_not_issued'
              ? 'Contractul nu mai este emis. Reîncarcă pagina.'
              : cause instanceof ApiHttpError && cause.status === 503
                ? 'Emailul nu a putut fi trimis acum. Încearcă din nou peste câteva momente.'
                : 'Nu am putut trimite contractul. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !send.isPending && close()}>
      <DialogContent data-testid="send-contract-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trimiți contractul prin email?</DialogTitle>
          <DialogDescription>
            PDF-ul reviziei {revision} pleacă atașat către {clientName}, în numele tău. Răspunsul
            vine la adresa ta de email, unde primești și o copie a mesajului.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
          <Field id="send-to" label="Către" mark="required" error={errors.to}>
            <Input
              id="send-to"
              type="email"
              data-testid="send-contract-to"
              autoComplete="off"
              disabled={send.isPending}
              aria-invalid={Boolean(errors.to)}
              aria-describedby={errors.to ? 'send-to-error' : undefined}
              {...form.register('to')}
            />
          </Field>
          <Field
            id="send-note"
            label="Mesajul tău"
            mark="optional"
            hint="Apare deasupra textului standard: „Vă transmitem atașat contractul… Vă rugăm să ni-l returnați semnat.”"
            error={errors.note}
          >
            <Textarea
              id="send-note"
              data-testid="send-contract-note"
              className="min-h-24"
              maxLength={1000}
              disabled={send.isPending}
              aria-describedby={errors.note ? 'send-note-error' : 'send-note-hint'}
              {...form.register('note')}
            />
          </Field>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="send-contract-error">
              {errors.root.server.message}
            </Notice>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={send.isPending} onClick={close}>
              Renunță
            </Button>
            <Button type="submit" data-testid="send-contract-confirm" disabled={send.isPending}>
              {send.isPending ? 'Se trimite…' : 'Trimite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
