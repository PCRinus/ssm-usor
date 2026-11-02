import {
  articleCount,
  type InstructionBody,
  instructionBodySchema,
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
import { ClipboardPaste, Eye } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Notice } from '@/components/notice';
import { InstructionBlocks } from '@/features/instructions/instruction-blocks';
import {
  blocksFromBody,
  type ClientName,
  clientPatterns,
  clientsNamedIn,
  type DraftBlock,
  draftBody,
  endSentence,
  isEmptyArticle,
} from '@/features/instructions/instruction-draft';
import {
  InstructionPreviewDialog,
  type PreviewRequest,
} from '@/features/instructions/instruction-preview-dialog';
import { articleCountLabel } from '@/features/instructions/instruction-schema';
import { PasteTextDialog } from '@/features/instructions/paste-text-dialog';

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
  const [blocks, setBlocks] = useState<DraftBlock[]>(() =>
    blocksFromBody(request.body, request.category)
  );
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [preview, setPreview] = useState<PreviewRequest | null>(null);
  const body = useMemo(() => draftBody(blocks), [blocks]);
  const count = articleCount(body);
  const patterns = useMemo(
    () =>
      clientPatterns(
        request.clientNames.map((legalName, index) => ({ id: `client-${index}`, legalName }))
      ),
    [request.clientNames]
  );
  const namedClients = useMemo(() => {
    const perBlock = new Map<string, ClientName[]>();
    if (patterns.length === 0) return perBlock;
    for (const block of blocks) {
      const found = clientsNamedIn(block.text, patterns);
      if (found.length > 0) perBlock.set(block.id, found);
    }
    return perBlock;
  }, [blocks, patterns]);
  const named = [...new Map([...namedClients.values()].flat().map((c) => [c.id, c])).values()];

  function problem() {
    if (count === 0) return 'Scrie cel puțin un articol.';
    const parsed = instructionBodySchema.safeParse(body);
    if (parsed.success) return null;
    const issue = parsed.error.issues[0];
    return issue?.code === 'custom'
      ? issue.message
      : 'Un titlu de secțiune are cel mult 300 de caractere, iar un paragraf cel mult 20.000.';
  }

  function save() {
    const found = problem();
    setError(found);
    if (found) return;
    onSave(sameBody(body, request.original) ? null : body);
  }

  const hasText = blocks.some((block) => block.text.trim() !== '');

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
              const found = problem();
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
        {named.length > 0 && (
          <Notice variant="warning" className="mb-4" data-testid="library-body-client-named">
            {named.map((client) => (
              <p key={client.id}>
                Textul numește clientul {endSentence(client.legalName)} Instrucțiunea se aplică și
                altor clienți.
              </p>
            ))}
          </Notice>
        )}
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
          setBlocks(
            mode === 'replace'
              ? added
              : [...blocks.filter((block) => !isEmptyArticle(block)), ...added]
          );
          setError(null);
        }}
      />
      <InstructionPreviewDialog request={preview} onClose={() => setPreview(null)} />
    </DialogContent>
  );
}
