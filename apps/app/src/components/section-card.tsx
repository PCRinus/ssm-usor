import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Pencil, Plus } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

type SectionCardProps = Omit<ComponentProps<typeof Card>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

// The action shares the title's row and the description runs the full width below both, so
// a narrow screen wraps the title rather than squeezing the description beside a button.
export function SectionCard({
  title,
  description,
  action,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <Card className={cn('gap-5', className)} {...props}>
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] grid-rows-none items-start gap-x-4 gap-y-1">
        <h2 className="text-lg leading-8 font-semibold">{title}</h2>
        {action && <div className="flex flex-wrap justify-end gap-2">{action}</div>}
        {description && (
          <p className="col-span-full max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function FactList({ className, ...props }: ComponentProps<'dl'>) {
  return (
    <dl
      className={cn('grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3', className)}
      {...props}
    />
  );
}

export function Fact({
  label,
  wide = false,
  testId,
  children,
}: {
  label: string;
  wide?: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={cn('grid min-w-0 content-start gap-1', wide && 'sm:col-span-full')}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className="font-medium wrap-anywhere">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 sm:col-span-full">{children}</div>;
}

export function EditAction({
  empty = false,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'variant' | 'size'> & { empty?: boolean }) {
  return (
    <Button variant="outline" size="sm" {...props}>
      {empty ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
      {empty ? 'Adaugă' : 'Modifică'}
    </Button>
  );
}
