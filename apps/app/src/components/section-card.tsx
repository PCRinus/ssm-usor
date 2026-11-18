import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Pencil, Plus } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { replayMask, replayShape } from '@/app/observability/replay-masking';

import { HelpLink } from './help-link';

type SectionCardProps = Omit<ComponentProps<typeof Card>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  help?: HelpTopic;
  action?: ReactNode;
  // `max-sm:contents` lets an action's parts take their own places in the header on a phone.
  actionClassName?: string;
  headingLevel?: 2 | 3;
  // A title the tab above already shows: screen readers still get it, without its help link.
  hideTitle?: boolean;
  // A title too long to share a phone's width with the action: the action takes its own row
  // as soon as the title cannot stay on one line beside it.
  longTitle?: boolean;
};

// The action shares the title's row while both fit, and takes its own row before the title is
// squeezed under it. The description runs the full width below both, or takes a hidden title's
// place beside the action.
export function SectionCard({
  title,
  description,
  help,
  action,
  actionClassName,
  headingLevel = 2,
  hideTitle = false,
  longTitle = false,
  className,
  children,
  ...props
}: SectionCardProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const helpTopic = hideTitle ? undefined : help;
  return (
    // The scroll margin clears the sticky app header and a record's tab bar when a link scrolls
    // to the card by its id.
    <Card className={cn('scroll-mt-32 gap-5', className)} {...props}>
      <CardHeader className="flex flex-wrap items-start gap-x-4 gap-y-1">
        {/* The help link stays outside the heading, whose accessible name is the title alone, and
            follows its last word when the title wraps. */}
        <div
          className={cn(
            'flex min-h-8 items-center',
            hideTitle ? 'min-w-[min(100%,24rem)]' : 'min-w-[min(100%,8rem)]',
            longTitle ? 'flex-auto' : 'flex-1'
          )}
        >
          {/* The heading's size sits here because the help link aligns by the font it inherits. */}
          <div className="min-w-0 text-lg leading-snug whitespace-nowrap">
            <Heading
              data-slot="section-card-title"
              className={cn(
                'font-semibold whitespace-normal',
                helpTopic && 'inline',
                hideTitle && 'sr-only'
              )}
            >
              {title}
            </Heading>
            {helpTopic && (
              <HelpLink
                topic={helpTopic}
                label={typeof title === 'string' ? `Ajutor: ${title}` : 'Ajutor'}
                className="ml-1"
              />
            )}
          </div>
          {hideTitle && description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className={cn('flex flex-wrap gap-2', actionClassName)}>{action}</div>}
        {description && !hideTitle && (
          <div className="w-full">
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          </div>
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
  replay,
  children,
}: {
  label: string;
  wide?: boolean;
  testId?: string;
  replay?: 'mask' | 'shape';
  children?: ReactNode;
}) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={cn('grid min-w-0 content-start gap-1', wide && 'sm:col-span-full')}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        data-testid={testId}
        className="font-medium wrap-anywhere"
        {...(replay === 'mask' && replayMask)}
        {...(replay === 'shape' && replayShape)}
      >
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
    <Button variant="secondary" size="sm" {...props}>
      {empty ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
      {empty ? 'Adaugă' : 'Modifică'}
    </Button>
  );
}
