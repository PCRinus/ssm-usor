import { Button } from '@ssm-usor/ui/components/button';
import {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
} from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useRef } from 'react';

import { Notice } from '@/components/notice';

import { QuestionCitation } from './question-citation';
import { type BankQuestion, minimumMessage } from './test-format';

const panel = 'rounded-xl bg-card shadow-(--panel-shadow) outline outline-transparent';
const actionButton = 'max-sm:w-full max-sm:px-2';

export function QuestionItem({
  question,
  number,
  busy,
  error,
  minimumOpen,
  minimum,
  onMinimumClose,
  onAdd,
  onPreview,
  onHide,
  onRestore,
  onEdit,
  onDelete,
}: {
  question: BankQuestion;
  // Null for a hidden question, which the tests leave out.
  number: number | null;
  busy: boolean;
  error: string | null;
  minimumOpen: boolean;
  minimum: number;
  onMinimumClose: () => void;
  // Takes where focus returns once the question dialog it opens closes.
  onAdd: (returnFocus: HTMLElement | null) => void;
  onPreview: () => void;
  onHide: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { hidden, builtIn } = question;
  const hideRef = useRef<HTMLButtonElement>(null);
  const leftOutside = useRef(false);
  const messageId = useId();
  const correct = question.options.filter((option) => option.correct).length;

  const actions = hidden ? (
    <Button
      variant="secondary"
      size="sm"
      data-testid="test-question-restore"
      disabled={busy}
      onClick={onRestore}
    >
      <RotateCcw aria-hidden="true" />
      Repune în test
    </Button>
  ) : (
    <>
      <Button
        variant="secondary"
        size="sm"
        data-testid="test-question-preview"
        className={cn(actionButton, !builtIn && 'max-sm:col-span-2')}
        onClick={onPreview}
      >
        <Eye aria-hidden="true" />
        Previzualizează
      </Button>
      {builtIn ? (
        <Popover open={minimumOpen} onOpenChange={(open) => !open && onMinimumClose()}>
          <PopoverAnchor asChild>
            <Button
              ref={hideRef}
              variant="secondary"
              size="sm"
              data-testid="test-question-hide"
              aria-expanded={minimumOpen}
              className={cn(
                actionButton,
                'aria-expanded:bg-section-tab-hover aria-expanded:shadow-[inset_0_0_0_1px_var(--color-input)]'
              )}
              disabled={busy}
              onClick={onHide}
            >
              <EyeOff aria-hidden="true" />
              Ascunde din test
            </Button>
          </PopoverAnchor>
          <PopoverContent
            align="end"
            collisionPadding={12}
            data-testid="test-minimum"
            aria-label="Minimul de întrebări active"
            aria-describedby={messageId}
            className="w-95 rounded-xl p-4 shadow-lg max-sm:w-[calc(100vw-1.5rem)]"
            onOpenAutoFocus={() => {
              leftOutside.current = false;
            }}
            onInteractOutside={(event) => {
              if (hideRef.current?.contains(event.target as Node)) event.preventDefault();
              else leftOutside.current = true;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              // After a click elsewhere, focus stays where the member went.
              if (!leftOutside.current) hideRef.current?.focus({ preventScroll: true });
            }}
          >
            <PopoverArrow asChild width={14} height={7}>
              <svg viewBox="0 0 14 7" aria-hidden="true" className="-translate-y-px">
                <path d="M0 0 L7 7 L14 0" className="fill-popover stroke-border" />
              </svg>
            </PopoverArrow>
            <p id={messageId} className="text-sm leading-[22px]">
              {minimumMessage(minimum)}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              data-testid="test-minimum-add"
              onClick={() => onAdd(hideRef.current)}
            >
              <Plus aria-hidden="true" />
              Adaugă o întrebare
            </Button>
          </PopoverContent>
        </Popover>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            data-testid="test-question-edit"
            className={actionButton}
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
            Modifică
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="test-question-delete"
            className={actionButton}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
            Șterge
          </Button>
        </>
      )}
    </>
  );

  return (
    <li
      data-testid="test-question"
      data-question-id={question.id}
      data-built-in={builtIn}
      data-hidden={hidden}
      className={cn(
        hidden
          ? 'rounded-xl bg-muted/50 px-4 py-3.5 shadow-(--panel-ring) outline outline-transparent sm:px-7 sm:py-[18px]'
          : cn(panel, 'px-4 py-[18px] sm:px-7 sm:py-6')
      )}
    >
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-2 sm:grid-cols-[1.875rem_minmax(0,1fr)_auto] sm:gap-x-3">
        <span
          aria-hidden={number === null}
          className={cn(
            'text-right text-[17px] leading-[26px] font-semibold tabular-nums',
            number === null ? 'text-muted-foreground' : 'text-section-tab-foreground'
          )}
        >
          {number === null ? '–' : `${number}.`}
        </span>
        <div className="min-w-0">
          <p
            data-testid="test-question-text"
            className={cn(
              'text-[17px] leading-[26px] text-pretty',
              hidden ? 'font-medium text-section-tab-foreground' : 'font-semibold'
            )}
          >
            {question.text}
          </p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            {hidden && (
              <span data-testid="test-question-hidden">
                <b className="font-semibold">Ascunsă</b>, nu intră în test ·{' '}
              </span>
            )}
            <span data-testid="test-question-kind">{builtIn ? 'Predefinită' : 'Proprie'}</span>
          </p>
        </div>
        <div
          className={cn(
            'col-span-full mt-3 flex flex-wrap gap-2 sm:col-span-1 sm:-mt-[3px] sm:justify-end',
            !hidden && 'max-sm:grid max-sm:grid-cols-2'
          )}
        >
          {actions}
        </div>
      </div>

      {!hidden && (
        <div className="mt-3.5 sm:mt-[18px] sm:ml-[42px]">
          <ul aria-label="Variantele de răspuns" className="grid gap-0.5">
            {question.options.map((option, index) => (
              <li
                key={index}
                data-testid="test-question-option"
                data-correct={option.correct}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-[15px] leading-[23px] sm:gap-3 sm:px-3',
                  option.correct
                    ? 'bg-success font-semibold text-success-foreground'
                    : 'text-section-tab-foreground'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-[1.5px] grid size-5 shrink-0 place-items-center rounded-[5px] border',
                    option.correct
                      ? 'border-success-foreground bg-success-foreground text-success'
                      : 'border-border bg-card'
                  )}
                >
                  {option.correct && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="max-w-[75ch] min-w-0">{option.text}</span>
                {option.correct && (
                  <span className="ml-auto shrink-0 pl-4 text-[13px] leading-[23px] font-semibold max-sm:sr-only">
                    Corect
                  </span>
                )}
              </li>
            ))}
          </ul>
          {correct > 1 && (
            <p
              data-testid="test-question-many"
              className="mt-2.5 text-[13px] leading-5 font-medium text-success-foreground"
            >
              {correct} răspunsuri corecte: lucrătorul le bifează pe toate.
            </p>
          )}
          {(question.explanation || question.citation) && (
            <div className="mt-4 flex flex-col rounded-[10px] bg-background p-3.5 sm:px-5 sm:pt-4 sm:pb-[18px]">
              <div className="contents sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6 sm:gap-y-1">
                {question.explanation && (
                  <p className="text-[13px] leading-5 font-semibold">Explicație</p>
                )}
                {question.citation && (
                  <QuestionCitation
                    citation={question.citation}
                    parts={question.citationParts}
                    className={cn(question.explanation && 'order-3 mt-2.5 sm:order-none sm:mt-0')}
                  />
                )}
              </div>
              {question.explanation && (
                <p
                  data-testid="test-question-explanation"
                  className="mt-1.5 max-w-[78ch] text-sm leading-[22px] text-pretty"
                >
                  {question.explanation}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <Notice variant="destructive" data-testid="test-bank-error" className="mt-3 sm:ml-[42px]">
          {error}
        </Notice>
      )}
    </li>
  );
}
