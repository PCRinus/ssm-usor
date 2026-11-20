import { Button } from '@ssm-usor/ui/components/button';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import { File as FileIcon, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Masked } from '@/components/replay';
import {
  chosenFileKind,
  formatFileSize,
  refusalBeforeUpload,
} from '@/features/client-files/client-file-format';
import { useFileDrop, useRefuseStrayDrops } from '@/features/client-files/use-file-drop';

import { noScan, type ScanChoice, useEmployeeFiles } from './agreement-scan';

const scanAccept = '.pdf,.jpg,.jpeg,.png';

function scanRefusal(file: File) {
  const kind = chosenFileKind(file.name)?.key;
  if (kind !== 'pdf' && kind !== 'image') return 'Alege un PDF sau o imagine (JPEG, PNG).';
  return refusalBeforeUpload(file);
}

// A new scan goes up with the confirm, as a file of the employee; until then nothing is stored.
export function AgreementScanField({
  id,
  label,
  clientId,
  employeeId,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  clientId: string;
  employeeId: string;
  value: ScanChoice;
  onChange: (value: ScanChoice) => void;
  disabled: boolean;
}) {
  const files = useEmployeeFiles(clientId, employeeId);
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  // Only a pick or a removal moves the focus; the switch to the uploaded file leaves it be.
  const moveFocus = useRef(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (value.file ? removeButton : chooseButton).current?.focus();
  }, [value.file]);

  function choose(chosen: File[]) {
    const [file] = chosen;
    if (!file) return;
    const refused = scanRefusal(file);
    setRefusal(refused);
    if (refused) return;
    moveFocus.current = true;
    onChange({ file, existingId: '' });
  }

  const drop = useFileDrop(choose);
  useRefuseStrayDrops();
  const items = files.data?.items ?? [];

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="grid gap-2">
      <p id={`${id}-label`} className="text-sm leading-none font-medium">
        {label}
        <span className="ml-1 font-normal text-muted-foreground">(opțional)</span>
      </p>
      {value.file ? (
        <div
          data-testid={`${id}-chosen`}
          className="flex items-center gap-3 rounded-lg border bg-background p-3"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground">
            <FileIcon aria-hidden="true" className="size-4" />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
            <Masked className="truncate font-medium">{value.file.name}</Masked>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(value.file.size)} · se salvează în Documente
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-sm:size-11"
            ref={removeButton}
            aria-label="Scoate fișierul"
            data-testid={`${id}-remove`}
            disabled={disabled}
            onClick={() => {
              moveFocus.current = true;
              onChange(noScan);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <div
            data-testid={`${id}-drop`}
            className={cn(
              'grid justify-items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
              drop.dragging && 'border-primary bg-primary/5'
            )}
            {...(disabled ? {} : drop.handlers)}
          >
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-2">
                <Upload aria-hidden="true" className="size-4 text-muted-foreground" />
                Trage fișierul aici sau
              </span>
              <Button
                ref={chooseButton}
                type="button"
                variant="secondary"
                size="sm"
                data-testid={`${id}-choose`}
                disabled={disabled}
                onClick={() => input.current?.click()}
              >
                Alege fișierul
              </Button>
            </p>
            <p className="text-xs text-muted-foreground">
              PDF sau imagine. Se salvează în Documente, la lucrător.
            </p>
            <input
              ref={input}
              type="file"
              data-testid={`${id}-input`}
              className="hidden"
              accept={scanAccept}
              onChange={(event) => {
                choose(Array.from(event.target.files ?? []));
                // Emptied, so that choosing the same file again is still a change.
                event.target.value = '';
              }}
            />
          </div>
          {refusal && (
            <p data-testid={`${id}-refusal`} role="alert" className="text-sm text-destructive">
              {refusal}
            </p>
          )}
          <div className="grid gap-1.5 pt-1">
            <Label htmlFor={`${id}-existing`} className="font-normal text-muted-foreground">
              sau alege unul încărcat deja
            </Label>
            <NativeSelect
              id={`${id}-existing`}
              data-testid={`${id}-existing`}
              value={value.existingId}
              disabled={disabled || !files.isSuccess}
              onChange={(event) => onChange({ file: null, existingId: event.target.value })}
            >
              <NativeSelectOption value="">Fără fișier atașat</NativeSelectOption>
              {items.map((file) => (
                <NativeSelectOption key={file.id} value={file.id}>
                  {file.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </>
      )}
    </div>
  );
}
