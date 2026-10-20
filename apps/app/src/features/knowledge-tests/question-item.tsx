import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Eye, EyeOff, Pencil, RotateCcw, Trash2 } from 'lucide-react';

import { type BankQuestion, optionLetter } from './test-format';

export function QuestionItem({
  question,
  number,
  busy,
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
  onPreview: () => void;
  onHide: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { hidden, builtIn } = question;
  return (
    <li
      data-testid="test-question"
      data-question-id={question.id}
      data-built-in={builtIn}
      data-hidden={hidden}
      className={cn('grid gap-3 px-5 py-5', hidden && 'bg-muted/40')}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className={cn('flex min-w-0 flex-1 gap-3', hidden && 'text-muted-foreground')}>
          <span
            aria-hidden={number === null}
            className="w-6 shrink-0 pt-px text-right text-sm font-medium text-muted-foreground tabular-nums"
          >
            {number === null ? '–' : `${number}.`}
          </span>
          <p
            data-testid="test-question-text"
            className="max-w-prose min-w-0 text-[0.9375rem] leading-relaxed font-medium text-pretty"
          >
            {question.text}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" data-testid="test-question-kind">
            {builtIn ? 'Predefinită' : 'Proprie'}
          </Badge>
          {hidden && (
            <Badge variant="secondary" data-testid="test-question-hidden">
              Ascunsă
            </Badge>
          )}
        </div>
      </div>

      <ul
        aria-label="Variantele de răspuns"
        className={cn('grid max-w-prose gap-1 pl-9', hidden && 'text-muted-foreground')}
      >
        {question.options.map((option, index) => (
          <li
            key={index}
            data-testid="test-question-option"
            data-correct={option.correct}
            className="flex gap-2 text-sm leading-relaxed"
          >
            <span className="w-4 shrink-0 text-muted-foreground">{optionLetter(index)}.</span>
            <span className={cn('min-w-0', option.correct && !hidden && 'font-medium')}>
              {option.text}
            </span>
            {option.correct && (
              <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-medium text-success-foreground">
                <Check className="size-3.5" aria-hidden="true" />
                corect
              </span>
            )}
          </li>
        ))}
      </ul>

      {(question.explanation || question.citation) && (
        <div className="grid max-w-prose gap-1 pl-9 text-sm leading-relaxed text-muted-foreground">
          {question.explanation && (
            <p data-testid="test-question-explanation" className="border-l-2 pl-3">
              {question.explanation}
            </p>
          )}
          {question.citation && (
            <p data-testid="test-question-citation" className="pl-3.5 text-xs">
              Temei: {question.citation}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1 pl-7">
        <Button variant="ghost" size="sm" data-testid="test-question-preview" onClick={onPreview}>
          <Eye aria-hidden="true" />
          Previzualizează
        </Button>
        {builtIn ? (
          hidden ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="test-question-restore"
              disabled={busy}
              onClick={onRestore}
            >
              <RotateCcw aria-hidden="true" />
              Restaurează
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              data-testid="test-question-hide"
              disabled={busy}
              onClick={onHide}
            >
              <EyeOff aria-hidden="true" />
              Ascunde
            </Button>
          )
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              data-testid="test-question-edit"
              disabled={busy}
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" />
              Modifică
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="test-question-delete"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" />
              Șterge
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
