import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { FileX, FolderUp, Image as ImageIcon, LoaderCircle, Upload } from 'lucide-react';
import { type ReactNode, useRef } from 'react';

import { filesLabel, formatFileSize } from './import-format';
import { pickedFromInput } from './picked-files';
import { isPhoto, type PickedFile, type SelectedFile, type SetAsideFile } from './upload-selection';
import type { useImportDrop } from './use-import-drop';
import type { UploadPhase } from './use-import-upload';

export function UploadDropZone({
  drop,
  opening,
  icon,
  prompt,
  openingText,
  chooseFilesLabel,
  formats,
  accept,
  testIds,
  onPicked,
}: {
  drop: ReturnType<typeof useImportDrop>;
  opening: boolean;
  icon: ReactNode;
  prompt: string;
  openingText: string;
  chooseFilesLabel: string;
  formats: readonly string[];
  accept?: string;
  testIds: {
    zone: string;
    filesInput: string;
    folderInput: string;
    chooseFiles?: string;
    chooseFolder?: string;
  };
  onPicked: (picked: Promise<PickedFile[]> | PickedFile[]) => void;
}) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  return (
    <div
      data-testid={testIds.zone}
      className={cn(
        'grid justify-items-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-info-border bg-muted/30 p-5 text-center transition-colors',
        drop.dragging && 'border-primary bg-primary/5'
      )}
      {...drop.handlers}
    >
      {opening ? (
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        icon
      )}
      <p className="text-sm font-medium">{opening ? openingText : prompt}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={opening}
          data-testid={testIds.chooseFiles}
          onClick={() => filesInput.current?.click()}
        >
          <Upload aria-hidden="true" />
          {chooseFilesLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={opening}
          data-testid={testIds.chooseFolder}
          onClick={() => folderInput.current?.click()}
        >
          <FolderUp aria-hidden="true" />
          Alege un folder
        </Button>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5" aria-label="Fișiere pe care le citim">
        {formats.map((format) => (
          <span
            key={format}
            className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {format}
          </span>
        ))}
      </div>
      <input
        ref={filesInput}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        data-testid={testIds.filesInput}
        onChange={(event) => {
          onPicked(pickedFromInput(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        className="hidden"
        data-testid={testIds.folderInput}
        {...{ webkitdirectory: '' }}
        onChange={(event) => {
          onPicked(pickedFromInput(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}

export function UploadProgress({
  phase,
  onRetry,
  onContinue,
}: {
  phase: UploadPhase;
  onRetry: () => void;
  onContinue: () => void;
}) {
  if (phase.step === 'failed') {
    return (
      <Notice variant="destructive" data-testid="import-upload-error">
        {phase.error}
      </Notice>
    );
  }
  if (phase.step === 'stalled') {
    return (
      <Notice
        variant="destructive"
        data-testid="import-upload-stalled"
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Încearcă din nou
            </Button>
            {phase.uploaded > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={onContinue}>
                Citește fără ele
              </Button>
            )}
          </div>
        }
      >
        {phase.uploaded === 0
          ? 'Niciun fișier nu s-a încărcat. Verifică conexiunea și încearcă din nou.'
          : phase.failed === 1
            ? 'Un fișier nu s-a încărcat.'
            : `${filesLabel(phase.failed)} nu s-au încărcat.`}
      </Notice>
    );
  }
  if (phase.step === 'unstarted') {
    return (
      <Notice
        variant="destructive"
        data-testid="import-upload-stalled"
        action={
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Încearcă din nou
          </Button>
        }
      >
        {phase.error}
      </Notice>
    );
  }
  if (phase.step === 'empty') {
    return (
      <Notice variant="destructive" data-testid="import-upload-empty">
        Niciun fișier nu a ajuns la noi, așa că nu avem ce citi. Renunță la import și încarcă
        documentele din nou.
      </Notice>
    );
  }
  if (phase.step === 'choosing' || phase.step === 'short') return null;
  const [label, value] =
    phase.step === 'shrinking'
      ? [
          `Micșorăm fotografiile: ${phase.done} din ${phase.total}`,
          (phase.done / Math.max(1, phase.total)) * 100,
        ]
      : phase.step === 'hashing'
        ? [
            `Pregătim fișierele: ${phase.done} din ${phase.total}`,
            (phase.done / Math.max(1, phase.total)) * 100,
          ]
        : phase.step === 'uploading'
          ? [
              `Se încarcă: ${formatFileSize(phase.sentBytes)} din ${formatFileSize(phase.totalBytes)}`,
              (phase.sentBytes / Math.max(1, phase.totalBytes)) * 100,
            ]
          : ['Pornim citirea…', 100];
  return (
    <div className="grid gap-2" data-testid="import-upload-progress" role="status">
      <p className="text-sm tabular-nums">{label}</p>
      <Progress value={value} className="h-1.5" aria-label="Încărcarea fișierelor" />
    </div>
  );
}

// A HEIC photograph has no preview in most browsers until the import turns it into a JPEG.
export function LocalThumb({ file, className }: { file: SelectedFile; className: string }) {
  const previewable = file.mimeType === 'image/jpeg' || file.mimeType === 'image/png';
  if (previewable) {
    return (
      <img
        data-no-replay
        alt=""
        className={cn('shrink-0 rounded-md bg-secondary object-cover', className)}
        ref={(image) => {
          if (!image) return;
          const objectUrl = URL.createObjectURL(file.blob);
          image.src = objectUrl;
          return () => URL.revokeObjectURL(objectUrl);
        }}
      />
    );
  }
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-md bg-secondary', className)}
      aria-hidden="true"
    >
      <ImageIcon className="size-4 text-muted-foreground" />
    </span>
  );
}

export type SetAsideReasons = Record<Exclude<SetAsideFile['reason'], 'duplicate'>, string>;

const setAsideReasons: SetAsideReasons = {
  unsupported: 'tip de fișier pe care nu-l citim',
  too_large: 'are peste 20 MB',
  empty: 'fișierul e gol',
  name_too_long: 'numele are peste 255 de caractere',
};

export function SetAsideList({
  setAside,
  systemFiles,
  reasons = setAsideReasons,
  title = 'Puse deoparte, nu se încarcă',
}: {
  setAside: SetAsideFile[];
  systemFiles: string[];
  reasons?: SetAsideReasons;
  title?: string;
}) {
  if (setAside.length === 0 && systemFiles.length === 0) return null;
  const systemNames = [
    ...new Set(
      systemFiles.map((path) =>
        path.split('/').includes('__MACOSX') ? '__MACOSX' : path.split('/').at(-1)!
      )
    ),
  ];
  return (
    <section
      aria-labelledby="import-set-aside-heading"
      data-testid="import-set-aside"
      className="grid gap-1.5 rounded-lg border-[1.5px] border-dashed bg-muted/30 px-3 py-2.5"
    >
      <h3 id="import-set-aside-heading" className="text-sm font-medium">
        {title}
      </h3>
      <ul className="grid gap-1.5">
        {setAside.map((file) => (
          <li
            key={file.key}
            data-testid="import-set-aside-row"
            className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-[13px] leading-snug text-muted-foreground"
          >
            <FileX className="mt-0.5 size-4" aria-hidden="true" />
            <span className="wrap-anywhere">
              <span className="font-medium text-foreground">{file.path}</span>,{' '}
              {file.reason === 'duplicate'
                ? `${isPhoto(file) ? 'aceeași fotografie' : 'același fișier'} ca ${file.duplicateOf}`
                : reasons[file.reason]}
            </span>
          </li>
        ))}
        {systemFiles.length > 0 && (
          <li
            data-testid="import-system-files"
            className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-[13px] leading-snug text-muted-foreground"
          >
            <FileX className="mt-0.5 size-4" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">{systemNames.join(', ')}</span>,{' '}
              {systemFiles.length === 1
                ? 'un fișier de sistem'
                : `${filesLabel(systemFiles.length)} de sistem`}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
