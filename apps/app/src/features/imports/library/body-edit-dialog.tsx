import {
  type InstructionBody,
  type InstructionCategory,
  type InstructionDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Notice } from '@ssm-usor/ui/components/notice';
import { ClipboardPaste, Eye } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ClientNamedNotice } from '@/features/instructions/client-named-notice';
import { InstructionBlocks } from '@/features/instructions/instruction-blocks';
import { blocksFromBody } from '@/features/instructions/instruction-draft';
import {
  InstructionPreviewDialog,
  type PreviewRequest,
} from '@/features/instructions/instruction-preview-dialog';
import { articleCountLabel } from '@/features/instructions/instruction-schema';
import { PasteTextDialog } from '@/features/instructions/paste-text-dialog';
import { useInstructionBody } from '@/features/instructions/use-instruction-body';

export type BodyRequest = {
  key: string;
  title: string;
  domain: InstructionDomain;
  category: InstructionCategory;
  body: InstructionBody;
  original: InstructionBody;
  clientNames: string[];
};

export function BodyEditDialog({
  request,
  onSave,
  onClose,
}: {
  request: BodyRequest | null;
  onSave: (key: string, body: InstructionBody | null) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      {request && (
        <BodyEditContent
          key={request.key}
          request={request}
          onSave={(body) => {
            onSave(request.key, body);
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

const sameBody = (a: InstructionBody, b: InstructionBody) =>
  JSON.stringify(a) === JSON.stringify(b);

function BodyEditContent({
  request,
  onSave,
  onClose,
}: {
  request: BodyRequest;
  onSave: (body: InstructionBody | null) => void;
  onClose: () => void;
}) {
  const clients = useMemo(
    () => request.clientNames.map((legalName, index) => ({ id: `client-${index}`, legalName })),
    [request.clientNames]
  );
  const {
    blocks,
    setBlocks,
    body,
    articleCount: count,
    namedClients,
    named,
    hasText,
    problem,
    addPasted,
  } = useInstructionBody({
    initialBlocks: () => blocksFromBody(request.body, request.category),
    clients,
  });
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [preview, setPreview] = useState<PreviewRequest | null>(null);
  const emptyProblem = 'Scrie cel puțin un articol.';

  function save() {
    const found = problem(emptyProblem);
    setError(found);
    if (found) return;
    onSave(sameBody(body, request.original) ? null : body);
  }

  return (
    <DialogContent
      data-testid="library-body-dialog"
      showCloseButton
      className="flex h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(960px,calc(100vw-4rem))]"
    >
      <div className="grid gap-2 border-b px-5 pt-4 pb-3 pr-12">
        <DialogTitle className="text-lg leading-snug">Textul: {request.title}</DialogTitle>
        <DialogDescription>
          {articleCountLabel(count)}. Schimbarea rămâne în import și intră în bibliotecă la
          confirmare.
        </DialogDescription>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPasting(true)}>
            <ClipboardPaste aria-hidden="true" />
            Lipește text
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const found = problem(emptyProblem);
              setError(found);
              if (!found) setPreview({ title: request.title, domain: request.domain, body });
            }}
          >
            <Eye aria-hidden="true" />
            Previzualizare
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ClientNamedNotice named={named} testId="library-body-client-named" className="mb-4" />
        <InstructionBlocks
          blocks={blocks}
          category={request.category}
          namedClients={namedClients}
          onChange={(next) => {
            setBlocks(next);
            setError(null);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        {error && (
          <Notice variant="destructive" className="basis-full" data-testid="library-body-error">
            {error}
          </Notice>
        )}
        {!sameBody(request.body, request.original) && (
          <Button
            variant="ghost"
            className="sm:mr-auto"
            data-testid="library-body-reset"
            onClick={() => onSave(null)}
          >
            Revino la textul din pachet
          </Button>
        )}
        <Button variant="outline" className="ml-auto" onClick={onClose}>
          Renunță
        </Button>
        <Button data-testid="library-body-save" onClick={save}>
          Păstrează textul
        </Button>
      </div>
      <PasteTextDialog
        open={pasting}
        title={request.title}
        category={request.category}
        hasText={hasText}
        onClose={() => setPasting(false)}
        onAdd={(added, mode) => {
          addPasted(added, mode);
          setError(null);
        }}
      />
      <InstructionPreviewDialog request={preview} onClose={() => setPreview(null)} />
    </DialogContent>
  );
}
