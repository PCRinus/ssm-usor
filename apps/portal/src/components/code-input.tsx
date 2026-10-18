import { Input } from '@ssm-usor/ui/components/input';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

type CodeInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (code: string) => void;
  length: { min: number; max: number };
};

export function CodeInput({ value, onValueChange, length, className, ...props }: CodeInputProps) {
  return (
    <Input
      className={cn('h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums', className)}
      value={value}
      onChange={(event) =>
        onValueChange(event.target.value.replace(/\D/g, '').slice(0, length.max))
      }
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`[0-9]{${length.min},${length.max}}`}
      maxLength={length.max}
      {...props}
    />
  );
}
