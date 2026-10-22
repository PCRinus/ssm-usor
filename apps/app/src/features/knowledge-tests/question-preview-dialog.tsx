import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check } from 'lucide-react';
import { useState } from 'react';

import type { BankQuestion } from './test-format';

export function QuestionPreviewDialog({
  question,
  sittingSize,
  onClose,
}: {
  question: BankQuestion | null;
  sittingSize: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={question !== null} onOpenChange={(open) => !open && onClose()}>
      {question && (
        <QuestionPreview
          key={question.id}
          question={question}
          sittingSize={sittingSize}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function QuestionPreview({
  question,
  sittingSize,
  onClose,
}: {
  question: BankQuestion;
  sittingSize: number;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (index: number) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <DialogContent data-testid="test-question-preview-dialog" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Cum vede angajatul întrebarea</DialogTitle>
        <DialogDescription>
          În portal, o întrebare pe ecran, cu variantele amestecate. Răspunsul corect nu apare.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-2 grid gap-4">
        <div className="grid gap-5 rounded-xl border bg-card px-4 py-5 sm:px-5">
          <p className="text-xs font-medium text-muted-foreground tabular-nums">
            1 din {sittingSize}
          </p>
          <p
            data-testid="test-question-preview-text"
            className="text-lg leading-snug font-semibold text-pretty"
          >
            {question.text}
          </p>
          <div role="group" aria-label="Variantele de răspuns" className="grid gap-2">
            {question.options.map((option, index) => {
              const selected = chosen.has(index);
              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={selected}
                  data-testid="test-question-preview-option"
                  onClick={() => toggle(index)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-[0.9375rem] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    selected ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded border',
                      selected && 'border-primary bg-primary text-primary-foreground'
                    )}
                  >
                    {selected && <Check className="size-3.5" />}
                  </span>
                  {option.text}
                </button>
              );
            })}
          </div>
        </div>
        <section aria-labelledby="test-question-preview-after" className="grid gap-2">
          <h3 id="test-question-preview-after" className="text-sm font-medium">
            După un răspuns greșit
          </h3>
          {question.explanation ? (
            <div
              data-testid="test-question-preview-explanation"
              className="rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-relaxed"
            >
              <p className="font-medium">{question.text}</p>
              <p className="mt-1.5 text-muted-foreground">{question.explanation}</p>
            </div>
          ) : (
            <p
              data-testid="test-question-preview-no-explanation"
              className="text-sm text-muted-foreground"
            >
              Întrebarea nu are explicație: angajatul vede doar că a greșit-o, fără varianta
              corectă.
            </p>
          )}
        </section>
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>
          Închide
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
