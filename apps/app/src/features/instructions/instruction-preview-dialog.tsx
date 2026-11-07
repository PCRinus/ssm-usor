import type { InstructionDomain } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { useRouteContext } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';

import { previewInstruction } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { saveAs } from '@/features/documents/editor-frame';
import { PagePlaceholder } from '@/features/documents/editor-placeholder';

import type { DraftBody } from './instruction-draft';

const AnnexWordView = lazy(() => import('./annex-word-view'));

export type PreviewRequest = { title: string; domain: InstructionDomain; body: DraftBody };

export function InstructionPreviewDialog({
  request,
  onClose,
}: {
  request: PreviewRequest | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      {request && <PreviewContent request={request} />}
    </Dialog>
  );
}

const codes: Record<InstructionDomain, string> = { ssm: 'I.P.S.S.M.', su: 'I.P.S.U.' };

function PreviewContent({ request }: { request: PreviewRequest }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    previewInstruction(request, apiRequest)
      .then(async (file) => {
        const read = new Uint8Array(await file.arrayBuffer());
        if (!cancelled) setBytes(read);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apiRequest, request, attempt]);

  const fileName = `Previzualizare - ${codes[request.domain]} ${request.title}.docx`;

  return (
    <DialogContent
      data-testid="instruction-preview-dialog"
      showCloseButton
      className="flex h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-w-[min(1100px,calc(100vw-4rem))]"
    >
      <div className="flex min-h-14 items-center gap-3 border-b py-2 pr-12 pl-4 sm:pl-5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <DialogTitle className="truncate text-base leading-snug">
            Previzualizare: {codes[request.domain]} {request.title}
          </DialogTitle>
          <DialogDescription className="truncate text-xs max-sm:sr-only">
            Anexa așa cum se tipărește, cu textul de acum, chiar nesalvat. Numărul anexei și numele
            clientului se completează în documentele fiecărui client.
          </DialogDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="instruction-preview-download"
          disabled={!bytes}
          onClick={() => bytes && saveAs(bytes, fileName)}
        >
          <Download aria-hidden="true" />
          <span className="max-sm:sr-only">Descarcă previzualizarea</span>
        </Button>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/60"
        aria-busy={!shown && !failed}
      >
        {failed ? (
          <div className="p-6">
            <Notice
              variant="destructive"
              data-testid="instruction-preview-error"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut pregăti previzualizarea. Verifică conexiunea și încearcă din nou.
            </Notice>
          </div>
        ) : (
          <>
            {bytes && (
              <div className="h-full" inert={!shown}>
                <Suspense fallback={null}>
                  <AnnexWordView bytes={bytes} onReady={() => setShown(true)} />
                </Suspense>
              </div>
            )}
            {!shown && (
              <PagePlaceholder className="absolute inset-0">
                Se pregătește previzualizarea…
              </PagePlaceholder>
            )}
          </>
        )}
      </div>
    </DialogContent>
  );
}
