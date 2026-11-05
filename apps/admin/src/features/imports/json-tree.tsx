import { cn } from '@ssm-usor/ui/lib/utils';

function Primitive({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="break-words text-emerald-700 dark:text-emerald-400">“{value}”</span>;
  }
  return <span className="text-sky-700 tabular-nums dark:text-sky-400">{String(value)}</span>;
}

function JsonNode({
  name,
  value,
  depth,
  openDepth,
}: {
  name: string | null;
  value: unknown;
  depth: number;
  openDepth: number;
}) {
  const label = name === null ? null : <span className="text-foreground/80">{name}</span>;
  if (value === null || typeof value !== 'object') {
    return (
      <div className="py-0.5">
        {label}
        {label && <span className="text-muted-foreground">: </span>}
        <Primitive value={value} />
      </div>
    );
  }
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  const size = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  if (entries.length === 0) {
    return (
      <div className="py-0.5">
        {label}
        {label && <span className="text-muted-foreground">: </span>}
        <span className="text-muted-foreground">{Array.isArray(value) ? '[]' : '{}'}</span>
      </div>
    );
  }
  return (
    <details open={depth < openDepth} className="group py-0.5">
      <summary className="hover:bg-muted/60 -mx-1 cursor-pointer rounded px-1">
        {label ?? <span className="text-foreground/80">root</span>}{' '}
        <span className="text-muted-foreground">{size}</span>
      </summary>
      <div className="border-border/70 ml-1.5 border-l pl-3">
        {entries.map(([key, item]) => (
          <JsonNode key={key} name={key} value={item} depth={depth + 1} openDepth={openDepth} />
        ))}
      </div>
    </details>
  );
}

export function JsonTree({
  value,
  openDepth = 1,
  className,
  testId,
}: {
  value: unknown;
  openDepth?: number;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'min-w-0 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]',
        className
      )}
    >
      <JsonNode name={null} value={value} depth={0} openDepth={openDepth} />
    </div>
  );
}
