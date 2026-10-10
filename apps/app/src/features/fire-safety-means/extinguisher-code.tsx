import { cn } from '@ssm-usor/ui/lib/utils';

export function ExtinguisherCode({
  code,
  large = false,
  className,
}: {
  code: string;
  large?: boolean;
  className?: string;
}) {
  return (
    <span
      data-testid="extinguisher-code"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-primary font-semibold tracking-tight text-primary-foreground tabular-nums',
        large ? 'h-11 min-w-16 px-3 text-xl' : 'h-7 min-w-10 px-2 text-sm',
        className
      )}
    >
      {code}
    </span>
  );
}
