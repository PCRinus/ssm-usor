import { type InstructionDomain, instructionDomains } from '@ssm-usor/contracts';
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
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import { FileUp, Plus, Upload } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';

import { replayShow } from '@/app/observability/replay-masking';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import { clientFileAccept, fileCountLabel } from './client-file-format';
import { ChosenFileRow } from './client-file-upload-dialog';
import { domainChoiceLabel, keptToast, todayIso } from './earlier-instructions';
import { useClientFileUploads } from './use-client-file-uploads';
import { useFileDrop } from './use-file-drop';

// `domain` is null while the window is closed, and the domain it opens on otherwise.
export function EarlierInstructionsDialog({
  clientId,
  domain,
  onClose,
}: {
  clientId: string;
  domain: InstructionDomain | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={domain !== null} onOpenChange={(open) => !open && onClose()}>
      {domain && <AddForm clientId={clientId} initialDomain={domain} onClose={onClose} />}
    </Dialog>
  );
}

function AddForm({
  clientId,
  initialDomain,
  onClose,
}: {
  clientId: string;
  initialDomain: InstructionDomain;
  onClose: () => void;
}) {
  const { chosen, phase, add, remove, start } = useClientFileUploads(
    clientId,
    undefined,
    [],
    onClose,
    () => keptToast
  );
  const [domain, setDomain] = useState(initialDomain);
  const [validUntil, setValidUntil] = useState(todayIso);
  const [tried, setTried] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const drop = useFileDrop(add);
  const choosing = phase === 'choosing';
  const sending = phase === 'sending';
  const readyCount = chosen.filter((entry) => entry.state === 'ready').length;
  const failedCount = chosen.filter((entry) => entry.state === 'failed').length;
  const fileMissing = tried && readyCount === 0;
  const dayMissing = tried && validUntil === '';

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (readyCount === 0 || validUntil === '') return;
    start(false, { earlierInstructionsDomain: domain, validUntil });
  }

  const holdOpen = (event: Event) => {
    if (sending) event.preventDefault();
  };

  return (
    <DialogContent
      data-testid="earlier-instructions-dialog"
      className="sm:max-w-lg"
      showCloseButton={!sending}
      onEscapeKeyDown={holdOpen}
      onInteractOutside={holdOpen}
    >
      <form onSubmit={onSubmit} aria-busy={sending} noValidate>
        <DialogHeader>
          <DialogTitle>Adaugă instrucțiunile proprii anterioare</DialogTitle>
          <DialogDescription>
            Fișierul rămâne la „Alte documente”, într-o grupă a lui, și nu intră în documentele pe
            care le generezi.{' '}
            <HelpLink topic="angajati.instructiuni-anterioare">Află mai mult</HelpLink>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          {phase === 'finished' && failedCount > 0 && (
            <Notice variant="destructive" data-testid="earlier-instructions-failed">
              {failedCount === 1
                ? 'Un fișier nu a fost încărcat. Motivul este scris sub numele lui.'
                : `${fileCountLabel(failedCount)} nu au fost încărcate. Motivul este scris sub numele fiecăruia.`}
            </Notice>
          )}
          <Field id="earlier-instructions-domain" label="Domeniu" mark="required">
            <NativeSelect
              id="earlier-instructions-domain"
              data-testid="earlier-instructions-domain"
              {...replayShow}
              value={domain}
              disabled={!choosing}
              onChange={(event) => setDomain(event.target.value as InstructionDomain)}
            >
              {instructionDomains.map((each) => (
                <NativeSelectOption key={each} value={each}>
                  {domainChoiceLabel[each]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="earlier-instructions-file"
            label={chosen.length > 1 ? 'Fișiere' : 'Fișier'}
            mark="required"
            hint="PDF, imagini, Word sau Excel, de cel mult 25 MB."
            error={fileMissing ? { type: 'required', message: 'Alege fișierul.' } : undefined}
          >
            <div className="grid gap-2">
              {chosen.length > 0 && (
                <ul className="grid gap-2" aria-label="Fișiere alese">
                  {chosen.map((entry) => (
                    <ChosenFileRow
                      key={entry.key}
                      entry={entry}
                      personal={false}
                      removable={choosing}
                      onRemove={() => remove(entry.key)}
                    />
                  ))}
                </ul>
              )}
              {choosing &&
                (chosen.length === 0 ? (
                  <div
                    data-testid="earlier-instructions-drop"
                    className={cn(
                      'flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors',
                      drop.dragging && 'border-primary bg-primary/5',
                      fileMissing && 'border-destructive'
                    )}
                    {...drop.handlers}
                  >
                    <FileUp className="size-4" aria-hidden="true" />
                    <span className="max-sm:hidden">Trage fișierul aici sau</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="earlier-instructions-file"
                      data-testid="earlier-instructions-choose"
                      aria-describedby={
                        fileMissing
                          ? 'earlier-instructions-file-error'
                          : 'earlier-instructions-file-hint'
                      }
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload aria-hidden="true" />
                      Alege fișierul
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit"
                    data-testid="earlier-instructions-choose-more"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Plus aria-hidden="true" />
                    Adaugă încă un fișier
                  </Button>
                ))}
              <input
                ref={fileInput}
                type="file"
                multiple
                data-testid="earlier-instructions-input"
                className="hidden"
                accept={clientFileAccept}
                onChange={(event) => {
                  add(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
            </div>
          </Field>
          <Field
            id="earlier-instructions-valid-until"
            label="Valabile până la"
            mark="required"
            hint="Ziua din care se aplică instrucțiunile noi. Propunem ziua de azi."
            error={dayMissing ? { type: 'required', message: 'Alege ziua.' } : undefined}
          >
            <DatePicker
              id="earlier-instructions-valid-until"
              testId="earlier-instructions-valid-until"
              value={validUntil}
              onChange={setValidUntil}
              disabled={!choosing}
              invalid={dayMissing}
              describedBy={
                dayMissing
                  ? 'earlier-instructions-valid-until-error'
                  : 'earlier-instructions-valid-until-hint'
              }
              required
            />
          </Field>
        </DialogBody>
        <DialogFooter className="mt-6">
          {phase === 'finished' ? (
            <Button type="button" variant="ghost" onClick={onClose}>
              Închide
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={sending} onClick={onClose}>
                Renunță
              </Button>
              <Button type="submit" data-testid="earlier-instructions-submit" disabled={sending}>
                {sending ? 'Se încarcă…' : 'Adaugă instrucțiunile'}
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
