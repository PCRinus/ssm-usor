import { type InstructionCategory, splitInstruction, type SplitResult } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ArrowDown, ArrowUp, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { type ClipboardEvent, type SetStateAction, useLayoutEffect, useRef, useState } from 'react';

import { Notice } from '@/components/notice';

import {
  articleBlock,
  articleNumbers,
  blocksFromBody,
  type ClientName,
  type DraftBlock,
  endSentence,
  headingBlock,
  insertAfter,
  isEmptyArticle,
  moveBlock,
  restoreBlock,
  sectionStart,
  withExample,
} from './instruction-draft';
import { articleCountLabel } from './instruction-schema';

const articlePlaceholder =
  'Scrie articolul. Fiecare rând e un paragraf; un rând care începe cu „a)”, „1.”, „–” sau „•” se tipărește ca punct al unei enumerări.';

type PasteOffer = { blockId: string; kept: string; pastedInto: string; result: SplitResult };

const supportsFieldSizing =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('field-sizing', 'content')
    : true;

function ArticleText({
  id,
  value,
  placeholder,
  marked,
  onChange,
  onPaste,
}: {
  id: string;
  value: string;
  placeholder: string;
  marked: boolean;
  onChange: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (supportsFieldSizing || !box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight + 2}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      id={id}
      data-testid="instruction-article-text"
      rows={2}
      className={cn(
        'min-h-20 leading-relaxed',
        marked && 'border-amber-500 focus-visible:border-amber-500'
      )}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onPaste={onPaste}
    />
  );
}

export function InstructionBlocks({
  blocks,
  category,
  namedClients,
  onChange,
}: {
  blocks: DraftBlock[];
  category: InstructionCategory;
  namedClients: Map<string, ClientName[]>;
  onChange: (next: SetStateAction<DraftBlock[]>) => void;
}) {
  const numbers = articleNumbers(blocks);
  const [offer, setOffer] = useState<PasteOffer | null>(null);

  const update = (id: string, text: string) =>
    onChange(blocks.map((block) => (block.id === id ? { ...block, text } : block)));

  function remove(index: number) {
    const block = blocks[index]!;
    const neighbours = {
      before: blocks[index - 1]?.id ?? null,
      after: blocks[index + 1]?.id ?? null,
    };
    const without = blocks.filter((each) => each.id !== block.id);
    onChange(without.length > 0 ? without : [articleBlock()]);
    if (block.kind === 'heading' ? block.text.trim() !== '' : !isEmptyArticle(block)) {
      toast(block.kind === 'heading' ? 'Am șters titlul.' : 'Am șters articolul.', {
        action: {
          label: 'Anulează',
          onClick: () => onChange((current) => restoreBlock(current, block, neighbours)),
        },
      });
    }
  }

  function offerSplit(block: DraftBlock, event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData('text/plain');
    if (!/\S[^\S\n]*\r?\n[\s\S]*\S/u.test(pasted)) return;
    const result = splitInstruction(pasted);
    if (result.articles.length < 2) return;
    const box = event.currentTarget;
    const before = box.value.slice(0, box.selectionStart);
    const after = box.value.slice(box.selectionEnd);
    setOffer({
      blockId: block.id,
      kept: `${before}${after}`,
      pastedInto: `${before}${pasted.replace(/\r\n?/gu, '\n')}${after}`,
      result,
    });
  }

  function split(current: PasteOffer) {
    const at = blocks.findIndex((block) => block.id === current.blockId);
    if (at < 0) return;
    const made = blocksFromBody(current.result.body, category);
    const kept = current.kept.trim();
    const next =
      kept === ''
        ? [...blocks.slice(0, at), ...made, ...blocks.slice(at + 1)]
        : insertAfter(
            blocks.map((block) =>
              block.id === current.blockId ? { ...block, text: kept } : block
            ),
            current.blockId,
            made
          );
    onChange(next);
    setOffer(null);
  }

  return (
    <ol className="grid gap-4" data-testid="instruction-blocks">
      {blocks.map((block, index) => {
        const fieldId = `instruction-block-${block.id}`;
        const number = numbers.get(block.id);
        const label =
          block.kind === 'heading'
            ? 'Titlu de secțiune'
            : number
              ? `Art. ${number}`
              : 'Articol nou';
        const headingAt = block.kind === 'article' ? sectionStart(blocks, index) : -1;
        const heading = headingAt >= 0 ? blocks[headingAt] : undefined;
        const hint =
          heading?.kind === 'heading' && heading.section?.hint && headingAt === index - 1
            ? heading.section.hint
            : articlePlaceholder;
        const named = namedClients.get(block.id) ?? [];
        return (
          <li
            key={block.id}
            data-testid="instruction-block"
            data-kind={block.kind}
            className={cn('grid gap-1.5', block.kind === 'heading' && index > 0 && 'mt-4')}
          >
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Label
                htmlFor={fieldId}
                data-testid="instruction-block-label"
                className={cn(
                  'text-sm',
                  block.kind === 'heading'
                    ? 'text-xs font-medium text-muted-foreground uppercase'
                    : number
                      ? 'font-semibold'
                      : 'font-medium text-muted-foreground'
                )}
              >
                {label}
              </Label>
              <div className="flex items-center gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      data-testid="instruction-block-add"
                      aria-label={`Adaugă după ${label}`}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      data-testid="instruction-add-article"
                      onSelect={() => onChange(insertAfter(blocks, block.id, [articleBlock()]))}
                    >
                      Articol dedesubt
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="instruction-add-heading"
                      onSelect={() =>
                        onChange(insertAfter(blocks, block.id, [headingBlock(), articleBlock()]))
                      }
                    >
                      Titlu de secțiune dedesubt
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-testid="instruction-block-up"
                  aria-label={`Mută ${label} mai sus`}
                  disabled={index === 0}
                  onClick={() => onChange(moveBlock(blocks, block.id, -1))}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-testid="instruction-block-down"
                  aria-label={`Mută ${label} mai jos`}
                  disabled={index === blocks.length - 1}
                  onClick={() => onChange(moveBlock(blocks, block.id, 1))}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-testid="instruction-block-delete"
                  aria-label={`Șterge ${label}`}
                  onClick={() => remove(index)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
            {block.kind === 'heading' ? (
              <>
                <Input
                  id={fieldId}
                  data-testid="instruction-heading-text"
                  className="font-semibold"
                  placeholder="De exemplu: Înainte de începerea lucrului"
                  value={block.text}
                  maxLength={300}
                  onChange={(event) => update(block.id, event.target.value.replace(/\n/gu, ' '))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const next = blocks[index + 1];
                    if (next?.kind === 'article' && isEmptyArticle(next)) {
                      document.getElementById(`instruction-block-${next.id}`)?.focus();
                      return;
                    }
                    const added = articleBlock();
                    onChange(insertAfter(blocks, block.id, [added]));
                    requestAnimationFrame(() =>
                      document.getElementById(`instruction-block-${added.id}`)?.focus()
                    );
                  }}
                />
                {block.section?.example && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit text-muted-foreground"
                    data-testid="instruction-show-example"
                    onClick={() => onChange(withExample(blocks, block.id))}
                  >
                    <Lightbulb aria-hidden="true" />
                    Arată un exemplu
                  </Button>
                )}
              </>
            ) : (
              <ArticleText
                id={fieldId}
                value={block.text}
                placeholder={hint}
                marked={named.length > 0}
                onChange={(text) => update(block.id, text)}
                onPaste={(event) => offerSplit(block, event)}
              />
            )}
            {named.length > 0 && (
              <p
                className="text-xs text-amber-800 dark:text-amber-300"
                data-testid="instruction-client-mark"
              >
                Numește clientul {endSentence(named.map((client) => client.legalName).join(', '))}
              </p>
            )}
            {offer?.blockId === block.id && block.text === offer.pastedInto && (
              <Notice
                variant="info"
                data-testid="instruction-paste-offer"
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      data-testid="instruction-paste-split"
                      onClick={() => split(offer)}
                    >
                      Împarte în articole
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOffer(null)}>
                      Lasă într-un articol
                    </Button>
                  </div>
                }
              >
                Textul lipit se poate împărți în{' '}
                {articleCountLabel(offer.result.articles.length).toLowerCase()}.
              </Notice>
            )}
          </li>
        );
      })}
    </ol>
  );
}
