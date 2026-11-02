import { type InstructionCategory, splitInstruction, type SplitResult } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ArrowDown, ArrowUp, Heading, Lightbulb, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  type ClipboardEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Notice } from '@/components/notice';

import {
  addSection,
  articleBlock,
  articleNumbers,
  blocksFromBody,
  type ClientName,
  type DraftArticle,
  type DraftBlock,
  type DraftSection,
  draftSections,
  endSentence,
  headingBlock,
  insertAfter,
  insertHeadingAfter,
  isEmptyArticle,
  moveBlock,
  moveSection,
  printedIds,
  removeSection,
  restoreBlock,
  restoreBlocks,
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

const fieldId = (id: string) => `instruction-block-${id}`;

function ArticleText({
  id,
  value,
  placeholder,
  marked,
  onChange,
  onFocus,
  onPaste,
}: {
  id: string;
  value: string;
  placeholder: string;
  marked: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
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
        'min-h-20 bg-card leading-relaxed dark:bg-input/30',
        marked && 'border-amber-500 focus-visible:border-amber-500'
      )}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      onPaste={onPaste}
    />
  );
}

function MenuTrigger({ label, testId }: { label: string; testId: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
        data-testid={testId}
        aria-label={label}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
  );
}

function MenuItem({
  testId,
  icon,
  disabled,
  destructive,
  onSelect,
  children,
}: {
  testId: string;
  icon: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem
      data-testid={testId}
      variant={destructive ? 'destructive' : 'default'}
      disabled={disabled}
      className="h-9"
      onSelect={onSelect}
    >
      {icon}
      {children}
    </DropdownMenuItem>
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
  const printed = printedIds(blocks);
  const sections = draftSections(blocks);
  const place = new Map(blocks.map((block, index) => [block.id, index]));
  const [offer, setOffer] = useState<PasteOffer | null>(null);
  // Headings whose sections show their boxes while still empty, once the member writes in them.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(fieldId(focusTarget.id))?.focus();
  }, [focusTarget]);

  const focusBlock = (id: string) => setFocusTarget({ id });
  // A menu keeps focus inside it until it has closed, then hands it back to its trigger.
  const focusAfterMenu = useRef<string | null>(null);
  function closeMenu(event: Event) {
    const id = focusAfterMenu.current;
    focusAfterMenu.current = null;
    if (id === null) return;
    event.preventDefault();
    document.getElementById(fieldId(id))?.focus();
  }
  const open = (headingId: string) =>
    setOpened((current) => (current.has(headingId) ? current : new Set(current).add(headingId)));

  const update = (id: string, text: string) =>
    onChange(blocks.map((block) => (block.id === id ? { ...block, text } : block)));

  function removeArticle(article: DraftArticle) {
    const index = place.get(article.id)!;
    const neighbours = {
      before: blocks[index - 1]?.id ?? null,
      after: blocks[index + 1]?.id ?? null,
    };
    const without = blocks.filter((each) => each.id !== article.id);
    onChange(without.length > 0 ? without : [articleBlock()]);
    if (!isEmptyArticle(article)) {
      toast('Am șters articolul.', {
        action: {
          label: 'Anulează',
          onClick: () => onChange((current) => restoreBlock(current, article, neighbours)),
        },
      });
    }
  }

  function deleteSection(headingId: string) {
    const { blocks: rest, removed, neighbours } = removeSection(blocks, headingId);
    onChange(rest.length > 0 ? rest : [articleBlock()]);
    const wrote = removed.some((block) =>
      block.kind === 'heading' ? block.text.trim() !== '' : !isEmptyArticle(block)
    );
    if (wrote) {
      toast('Am șters secțiunea.', {
        action: {
          label: 'Anulează',
          onClick: () => onChange((current) => restoreBlocks(current, removed, neighbours)),
        },
      });
    }
  }

  function newSectionAfter(headingId: string | null) {
    const heading = headingBlock();
    onChange(addSection(blocks, headingId, heading));
    return heading.id;
  }

  function sectionAfterArticle(articleId: string) {
    const heading = headingBlock();
    onChange(insertHeadingAfter(blocks, articleId, heading));
    return heading.id;
  }

  function newArticleAfter(id: string) {
    const added = articleBlock();
    onChange(insertAfter(blocks, id, [added]));
    return added.id;
  }

  function writeIn(section: DraftSection) {
    if (section.heading) open(section.heading.id);
    const empty = section.articles.find(isEmptyArticle);
    if (empty) focusBlock(empty.id);
    else focusBlock(newArticleAfter(section.articles.at(-1)?.id ?? section.heading!.id));
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

  function articleRow(article: DraftArticle, headingId: string | null) {
    const index = place.get(article.id)!;
    const number = numbers.get(article.id);
    const label = number ? `Art. ${number}` : 'Articol nou';
    const before = blocks[index - 1];
    const hint =
      before?.kind === 'heading' && before.section?.hint ? before.section.hint : articlePlaceholder;
    const named = namedClients.get(article.id) ?? [];
    return (
      <li
        key={article.id}
        data-testid="instruction-block"
        data-kind="article"
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 py-3 sm:grid-cols-[60px_minmax(0,1fr)_auto]"
      >
        <Label
          htmlFor={fieldId(article.id)}
          data-testid="instruction-block-label"
          className={cn(
            'col-start-1 row-start-1 self-center text-sm whitespace-nowrap tabular-nums sm:self-start sm:pt-2.5',
            number ? 'font-semibold' : 'font-medium text-muted-foreground'
          )}
        >
          {label}
        </Label>
        <div className="col-span-2 col-start-1 row-start-2 grid min-w-0 gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <ArticleText
            id={fieldId(article.id)}
            value={article.text}
            placeholder={hint}
            marked={named.length > 0}
            onChange={(text) => update(article.id, text)}
            onFocus={() => headingId && open(headingId)}
            onPaste={(event) => offerSplit(article, event)}
          />
          {named.length > 0 && (
            <p
              className="text-xs text-amber-800 dark:text-amber-300"
              data-testid="instruction-client-mark"
            >
              Numește clientul {endSentence(named.map((client) => client.legalName).join(', '))}
            </p>
          )}
          {offer?.blockId === article.id && article.text === offer.pastedInto && (
            <Notice
              variant="info"
              data-testid="instruction-paste-offer"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button data-testid="instruction-paste-split" onClick={() => split(offer)}>
                    Împarte în articole
                  </Button>
                  <Button variant="ghost" onClick={() => setOffer(null)}>
                    Lasă într-un articol
                  </Button>
                </div>
              }
            >
              Textul lipit se poate împărți în{' '}
              {articleCountLabel(offer.result.articles.length).toLowerCase()}.
            </Notice>
          )}
        </div>
        <div className="col-start-2 row-start-1 -my-1 sm:col-start-3 sm:my-0">
          <DropdownMenu>
            <MenuTrigger label={`Acțiuni pentru ${label}`} testId="instruction-article-menu" />
            <DropdownMenuContent align="end" className="w-72" onCloseAutoFocus={closeMenu}>
              <MenuItem
                testId="instruction-article-up"
                icon={<ArrowUp aria-hidden="true" />}
                disabled={index === 0}
                onSelect={() => onChange(moveBlock(blocks, article.id, -1))}
              >
                Mută mai sus
              </MenuItem>
              <MenuItem
                testId="instruction-article-down"
                icon={<ArrowDown aria-hidden="true" />}
                disabled={index === blocks.length - 1}
                onSelect={() => onChange(moveBlock(blocks, article.id, 1))}
              >
                Mută mai jos
              </MenuItem>
              <DropdownMenuSeparator />
              <MenuItem
                testId="instruction-article-add"
                icon={<Plus aria-hidden="true" />}
                onSelect={() => {
                  focusAfterMenu.current = newArticleAfter(article.id);
                }}
              >
                Articol nou dedesubt
              </MenuItem>
              <MenuItem
                testId="instruction-article-start-section"
                icon={<Heading aria-hidden="true" />}
                onSelect={() => {
                  focusAfterMenu.current = sectionAfterArticle(article.id);
                }}
              >
                Începe o secțiune după acest articol
              </MenuItem>
              <DropdownMenuSeparator />
              <MenuItem
                testId="instruction-article-delete"
                icon={<Trash2 aria-hidden="true" />}
                destructive
                onSelect={() => removeArticle(article)}
              >
                Șterge articolul
              </MenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
    );
  }

  return (
    <div className="grid gap-3.5" data-testid="instruction-blocks">
      {sections.map((section, sectionIndex) => {
        const { heading, articles } = section;
        const written = articles.filter((article) => !isEmptyArticle(article)).length;
        const empty = heading !== null && written === 0 && !printed.has(heading.id);
        const collapsed = empty && (!opened.has(heading.id) || articles.length === 0);
        const example = heading?.section?.example;
        const title = heading?.text.trim() ?? '';
        const exampleButton = (
          <Button
            variant="ghost"
            className="text-muted-foreground"
            data-testid="instruction-show-example"
            aria-label="Arată un exemplu"
            onClick={() => heading && onChange(withExample(blocks, heading.id))}
          >
            <Lightbulb aria-hidden="true" />
            <span className="sm:hidden">Un exemplu</span>
            <span className="max-sm:hidden">Arată un exemplu</span>
          </Button>
        );
        return (
          <section
            key={heading?.id ?? 'lead'}
            data-testid="instruction-section"
            data-empty={empty || undefined}
            aria-label={heading ? title || 'Secțiune fără titlu' : 'Articole fără secțiune'}
            className={cn(
              'rounded-xl border bg-card text-card-foreground shadow-xs',
              empty && 'border-dashed bg-muted/30 shadow-none'
            )}
          >
            {heading && (
              <div
                data-testid="instruction-block"
                data-kind="heading"
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-4 sm:pl-5"
              >
                <Input
                  id={fieldId(heading.id)}
                  aria-label="Titlul secțiunii"
                  data-testid="instruction-heading-text"
                  className="-ml-2.5 h-10 flex-1 basis-40 border-transparent bg-transparent px-2.5 text-lg font-semibold tracking-tight shadow-none hover:border-input focus-visible:bg-background md:text-lg dark:bg-transparent"
                  placeholder="De exemplu: Înainte de începerea lucrului"
                  value={heading.text}
                  maxLength={300}
                  onChange={(event) => update(heading.id, event.target.value.replace(/\n/gu, ' '))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    open(heading.id);
                    const next = blocks[place.get(heading.id)! + 1];
                    if (next?.kind === 'article' && isEmptyArticle(next)) focusBlock(next.id);
                    else focusBlock(newArticleAfter(heading.id));
                  }}
                />
                {empty ? (
                  printed.has(heading.id) ? null : (
                    <div className="max-sm:order-last max-sm:basis-full">
                      <Badge
                        variant="outline"
                        className="bg-card"
                        data-testid="instruction-section-unprinted"
                      >
                        Goală: nu se tipărește
                      </Badge>
                    </div>
                  )
                ) : (
                  <span
                    className="text-sm whitespace-nowrap text-muted-foreground max-sm:hidden"
                    data-testid="instruction-section-count"
                  >
                    {articleCountLabel(written)}
                  </span>
                )}
                <DropdownMenu>
                  <MenuTrigger
                    label={`Acțiuni pentru secțiunea ${title || 'fără titlu'}`}
                    testId="instruction-section-menu"
                  />
                  <DropdownMenuContent align="end" className="w-72" onCloseAutoFocus={closeMenu}>
                    <MenuItem
                      testId="instruction-section-up"
                      icon={<ArrowUp aria-hidden="true" />}
                      disabled={!sections[sectionIndex - 1]?.heading}
                      onSelect={() => onChange(moveSection(blocks, heading.id, -1))}
                    >
                      Mută secțiunea mai sus
                    </MenuItem>
                    <MenuItem
                      testId="instruction-section-down"
                      icon={<ArrowDown aria-hidden="true" />}
                      disabled={sectionIndex === sections.length - 1}
                      onSelect={() => onChange(moveSection(blocks, heading.id, 1))}
                    >
                      Mută secțiunea mai jos
                    </MenuItem>
                    <DropdownMenuSeparator />
                    <MenuItem
                      testId="instruction-section-add-below"
                      icon={<Plus aria-hidden="true" />}
                      onSelect={() => {
                        focusAfterMenu.current = newSectionAfter(heading.id);
                      }}
                    >
                      Adaugă o secțiune dedesubt
                    </MenuItem>
                    <DropdownMenuSeparator />
                    <MenuItem
                      testId="instruction-section-delete"
                      icon={<Trash2 aria-hidden="true" />}
                      destructive
                      onSelect={() => deleteSection(heading.id)}
                    >
                      Șterge secțiunea
                    </MenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {collapsed ? (
              <div
                data-testid="instruction-section-empty"
                className="grid gap-3 px-4 pb-4 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:px-5"
              >
                {heading?.section?.hint && (
                  <p className="max-w-[68ch] text-sm text-muted-foreground sm:min-w-80 sm:flex-1">
                    {heading.section.hint}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button
                    variant="outline"
                    className={cn(!example && 'col-span-2')}
                    data-testid="instruction-section-write-first"
                    aria-label="Scrie primul articol"
                    onClick={() => writeIn(section)}
                  >
                    <Plus aria-hidden="true" />
                    <span className="sm:hidden">Primul articol</span>
                    <span className="max-sm:hidden">Scrie primul articol</span>
                  </Button>
                  {example && exampleButton}
                </div>
              </div>
            ) : (
              <>
                <ol className={cn('grid divide-y px-4 sm:px-5', heading && 'border-t')}>
                  {articles.map((article) => articleRow(article, heading?.id ?? null))}
                </ol>
                <div className="flex flex-wrap gap-2 px-4 pb-4 sm:pr-5 sm:pl-[calc(1.25rem+60px+0.625rem)]">
                  <Button
                    variant="outline"
                    className="max-sm:w-full"
                    data-testid="instruction-section-add-article"
                    onClick={() =>
                      focusBlock(
                        newArticleAfter(articles.at(-1)?.id ?? heading?.id ?? blocks.at(-1)!.id)
                      )
                    }
                  >
                    <Plus aria-hidden="true" />
                    Articol nou
                  </Button>
                  {empty && example && exampleButton}
                </div>
              </>
            )}
          </section>
        );
      })}
      <Button
        variant="outline"
        className="h-12 w-full border-dashed bg-transparent font-semibold shadow-none dark:bg-transparent"
        data-testid="instruction-add-section"
        onClick={() => focusBlock(newSectionAfter(null))}
      >
        <Plus aria-hidden="true" />
        Adaugă o secțiune
      </Button>
    </div>
  );
}
