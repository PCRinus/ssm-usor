import {
  type InstructionCategory,
  type SplitFlag,
  splitFlagMessages,
  splitInstruction,
  type SplitResult,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Label } from '@ssm-usor/ui/components/label';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useDeferredValue, useMemo, useState } from 'react';

import { replayShow } from '@/app/observability/replay-masking';
import { Notice } from '@/components/notice';

import { blocksFromBody, type DraftBlock } from './instruction-draft';
import { articleCountLabel } from './instruction-schema';

export type PasteMode = 'replace' | 'append';

const flagTexts: Record<Exclude<SplitFlag['kind'], 'table_row' | 'empty_article'>, string> = {
  no_numbering: `${splitFlagMessages.no_numbering}: am făcut câte un articol din fiecare paragraf.`,
  no_articles: `${splitFlagMessages.no_articles}.`,
  text_before_first_article: `${splitFlagMessages.text_before_first_article}.`,
};

function flagLines(flags: readonly SplitFlag[]) {
  const lines = flags.flatMap((flag) =>
    flag.kind === 'table_row' || flag.kind === 'empty_article' ? [] : [flagTexts[flag.kind]]
  );
  const empty = flags.flatMap((flag) => (flag.kind === 'empty_article' ? [flag.number] : []));
  if (empty.length > 0) {
    lines.push(
      `${empty.length === 1 ? splitFlagMessages.empty_article : 'Articolele fără text nu au fost preluate'}: ${empty.map((number) => `Art. ${number}`).join(', ')}.`
    );
  }
  const tableArticles = [
    ...new Set(flags.flatMap((flag) => (flag.kind === 'table_row' ? [flag.article] : []))),
  ];
  if (tableArticles.length > 0) {
    lines.push(
      `${tableArticles.length === 1 ? 'Un rând de tabel a devenit paragraf' : 'Rândurile de tabel au devenit paragrafe'}, cu celulele despărțite de „–”: ${tableArticles.map((number) => `Art. ${number}`).join(', ')}.`
    );
  }
  return lines;
}

function SplitPreview({ result }: { result: SplitResult }) {
  const numbers: (number | null)[] = [];
  for (const block of result.body.blocks) {
    numbers.push(
      block.kind === 'article' ? numbers.filter((number) => number !== null).length + 1 : null
    );
  }
  return (
    <ol className="grid gap-2 text-sm" data-testid="paste-preview">
      {result.body.blocks.map((block, index) =>
        block.kind === 'heading' ? (
          <li key={index} className="pt-1 font-semibold" data-testid="paste-preview-heading">
            {block.text}
          </li>
        ) : (
          <li key={index} className="grid gap-1" data-testid="paste-preview-article">
            {block.paragraphs.map((paragraph, at) => (
              <p key={at} className={at > 0 ? 'pl-4' : undefined}>
                {at === 0 && <span className="font-semibold">Art. {numbers[index]}. </span>}
                {paragraph}
              </p>
            ))}
          </li>
        )
      )}
    </ol>
  );
}

export function PasteTextDialog({
  open,
  title,
  category,
  hasText,
  onClose,
  onAdd,
}: {
  open: boolean;
  title: string;
  category: InstructionCategory;
  hasText: boolean;
  onClose: () => void;
  onAdd: (blocks: DraftBlock[], mode: PasteMode) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {open && (
        <PasteContent
          title={title}
          category={category}
          hasText={hasText}
          onClose={onClose}
          onAdd={onAdd}
        />
      )}
    </Dialog>
  );
}

function PasteContent({
  title,
  category,
  hasText,
  onClose,
  onAdd,
}: {
  title: string;
  category: InstructionCategory;
  hasText: boolean;
  onClose: () => void;
  onAdd: (blocks: DraftBlock[], mode: PasteMode) => void;
}) {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text);
  const result = useMemo(
    () => (deferred.trim() === '' ? null : splitInstruction(deferred, { title })),
    [deferred, title]
  );
  const articles = result?.articles.length ?? 0;
  const flags = result ? flagLines(result.flags) : [];

  function add(mode: PasteMode) {
    if (!result) return;
    onAdd(blocksFromBody(result.body, category), mode);
    onClose();
  }

  return (
    <DialogContent
      data-testid="paste-dialog"
      className="flex max-h-[calc(100svh-2rem)] flex-col sm:max-w-3xl"
    >
      <DialogHeader>
        <DialogTitle>Lipește text</DialogTitle>
        <DialogDescription>
          Lipește o instrucțiune întreagă, copiată din Word sau dintr-un PDF. O împărțim în articole
          după numerotarea ei („Art. 12”, „12.” sau numerele din Word), iar numerele încep din nou
          de la 1. Verifică articolele înainte să le adaugi.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 gap-4 overflow-y-auto">
        <div className="grid gap-2">
          <Label htmlFor="paste-text">Textul instrucțiunii</Label>
          <Textarea
            id="paste-text"
            data-testid="paste-text"
            {...replayShow}
            className="max-h-64 min-h-32 [field-sizing:fixed]"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {result && (
          <div className="grid gap-3" aria-live="polite">
            <p className="text-sm font-medium" data-testid="paste-summary">
              {articles === 0
                ? 'Niciun articol'
                : `${articleCountLabel(articles)}${result.body.blocks.length > articles ? `, ${result.body.blocks.length - articles === 1 ? 'un titlu' : `${result.body.blocks.length - articles} titluri`} de secțiune` : ''}`}
            </p>
            {result.title && (
              <p className="text-sm text-muted-foreground" data-testid="paste-title">
                Am lăsat deoparte titlul de la început: „{result.title}”.
              </p>
            )}
            {flags.length > 0 && (
              <Notice variant="warning" data-testid="paste-flags">
                <ul className="grid gap-1">
                  {flags.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <div className="rounded-md border bg-muted/30 p-3">
              <SplitPreview result={result} />
            </div>
          </div>
        )}
      </div>
      <DialogFooter className="flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Renunță
        </Button>
        {hasText && (
          <Button
            type="button"
            variant="outline"
            data-testid="paste-append"
            disabled={articles === 0}
            onClick={() => add('append')}
          >
            Adaugă la sfârșit
          </Button>
        )}
        <Button
          type="button"
          data-testid="paste-replace"
          disabled={articles === 0}
          onClick={() => add('replace')}
        >
          {hasText ? 'Înlocuiește textul' : 'Adaugă articolele'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
