import { Button } from '@ssm-usor/ui/components/button';
import { Calendar } from '@ssm-usor/ui/components/calendar';
import { Input } from '@ssm-usor/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';

import { dateToIso, formatRoDate, isoToDate, parseRoDate } from '../lib/dates';

export interface DatePickerProps {
  id: string;
  // ISO date (YYYY-MM-DD) or an empty string.
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  // ISO bounds, inclusive.
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  testId?: string;
  className?: string;
}

// The form only ever sees ISO dates: an unfinished or impossible text reports an empty value,
// and the form's own validation names the field.
export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  min,
  max,
  disabled,
  invalid,
  describedBy,
  required,
  testId,
  className,
}: DatePickerProps) {
  const [text, setText] = useState(() => formatRoDate(value));
  const [open, setOpen] = useState(false);
  // A value set from outside (a CNP prefill, a reset) replaces the text; typing never
  // loses characters because a partial text parses to the same empty value.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (parseRoDate(text) !== (value || null)) setText(formatRoDate(value));
  }
  const selected = isoToDate(value);
  const minDate = min ? isoToDate(min) : undefined;
  const maxDate = max ? isoToDate(max) : undefined;
  const thisYear = new Date().getFullYear();

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        id={id}
        data-testid={testId}
        className="h-11"
        value={text}
        placeholder="zz.ll.aaaa"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseRoDate(event.target.value) ?? '';
          setSeen(parsed);
          onChange(parsed);
        }}
        onBlur={() => {
          // Tidy "1.3.2020" into "01.03.2020" once the date is known.
          if (value) setText(formatRoDate(value));
          onBlur?.();
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            data-testid={testId ? `${testId}-calendar` : undefined}
            aria-label="Deschide calendarul"
            disabled={disabled}
          >
            <CalendarIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? maxDate ?? new Date()}
            startMonth={minDate ?? new Date(thisYear - 100, 0)}
            endMonth={maxDate ?? new Date(thisYear + 1, 11)}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(day) => {
              if (!day) return;
              const next = dateToIso(day);
              setText(formatRoDate(next));
              setSeen(next);
              onChange(next);
              setOpen(false);
              onBlur?.();
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
