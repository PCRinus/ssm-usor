import { DocxEditor, useChromeTranslate, useEditorCommand } from '@docx-editor.dev/react';
import { countOf } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  Check,
  ChevronRight,
  EllipsisVertical,
  Redo2,
  TableOfContents,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { type MouseEvent, type ReactNode, useRef } from 'react';

import type { EditorBadge, EditorMenuItem, PhoneBar } from './editor-bar';
import { warningBadge } from './pack-styles';
import type { UnfilledMarks } from './use-unfilled-marks';

const itemClassName = 'min-h-11 gap-3 px-3 text-[15px] [&_svg]:size-5';

// Inside the editor its own copies of the theme's utilities (`bg-primary`, `text-foreground`,
// `border-border`…) outrank the app's and paint in its blue, so the bar and the strip name colours
// the editor does not define. The menu opens outside the editor and needs none of this.
const barColours = 'border-(color:--app-border) font-sans text-brand-forest';
const darkButton =
  'h-10 bg-brand-forest text-brand-cream hover:bg-brand-forest/90 hover:text-brand-cream focus-visible:ring-brand-forest/40';
const iconButton =
  'size-11 text-brand-forest hover:bg-brand-forest/10 hover:text-brand-forest focus-visible:ring-brand-forest/40';

// A tap on a bar button would otherwise move the focus, and the caret with it, out of the page.
const keepSelection = (event: MouseEvent) => event.preventDefault();

export function PhoneEditorBar({
  bar,
  editable,
  marks,
  navigation,
}: {
  bar: PhoneBar;
  editable: boolean;
  marks: UnfilledMarks;
  navigation: { open: boolean; toggle: () => void };
}) {
  const showFirstOnClose = useRef(false);
  const unfilled = editable ? marks.count : 0;
  const unfilledLabel = `${countOf(unfilled, 'loc', 'locuri')} de completat`;

  return (
    <div
      data-editor-phone-bar
      data-testid="editor-phone-bar"
      className="flex min-w-0 flex-1 flex-col"
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-1 px-2',
          barColours,
          editable && 'border-b'
        )}
      >
        {bar.back}
        {/* A draft's bar has undo and redo to fit, so its title is only in the menu. */}
        {editable ? (
          <span className="flex-1" />
        ) : (
          <span
            data-testid="editor-phone-title"
            className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold"
          >
            {bar.title}
          </span>
        )}
        {editable && <HistoryButtons />}
        {bar.main?.kind === 'button' && (
          <Button
            data-testid={bar.main.testId}
            className={darkButton}
            disabled={bar.main.disabled}
            onMouseDown={keepSelection}
            onClick={bar.main.onClick}
          >
            <bar.main.icon aria-hidden="true" />
            {bar.main.label}
          </Button>
        )}
        {bar.main?.kind === 'saved' && (
          <span
            data-testid="editor-phone-saved"
            className="flex shrink-0 items-center gap-1 px-1 text-sm text-(color:--app-muted-foreground)"
          >
            <Check className="size-4" aria-hidden="true" />
            Salvat
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="editor-phone-menu"
              className={cn('relative', iconButton)}
              aria-label={
                unfilled > 0 ? `Opțiunile documentului, ${unfilledLabel}` : 'Opțiunile documentului'
              }
            >
              <EllipsisVertical className="size-5" aria-hidden="true" />
              {unfilled > 0 && (
                <span
                  data-testid="editor-phone-unfilled-count"
                  aria-hidden="true"
                  className="absolute top-0.5 right-0 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-warning-border px-1 text-[0.6875rem] leading-none font-semibold text-warning-foreground"
                >
                  {unfilled}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            data-testid="editor-phone-menu-content"
            className="w-[19rem] max-w-[calc(100vw-1rem)]"
            onCloseAutoFocus={(event) => {
              if (!showFirstOnClose.current) return;
              showFirstOnClose.current = false;
              // Back on the trigger, the focus would take what is typed away from the mark.
              event.preventDefault();
              marks.showFirst();
            }}
          >
            <MenuHeading bar={bar} />
            {unfilled > 0 && (
              <DropdownMenuItem
                data-testid="editor-phone-unfilled"
                className="mx-1 mb-1 items-start gap-3 border border-warning-border bg-warning px-3 py-2.5 text-warning-foreground focus:bg-warning/70 focus:text-warning-foreground [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:text-warning-foreground"
                onSelect={() => {
                  showFirstOnClose.current = true;
                }}
              >
                <TriangleAlert aria-hidden="true" />
                <span className="grid gap-0.5">
                  <span className="text-[15px] font-semibold">{unfilledLabel}</span>
                  <span className="text-sm">Arată primul loc. Ce scrii acolo îl înlocuiește.</span>
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {bar.items.map((item) => (
              <MenuItem key={itemKey(item)} item={item} navigation={navigation} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {editable && <FormattingToolbar />}
      {editable && marks.stepping && <UnfilledStrip marks={marks} />}
    </div>
  );
}

function itemKey(item: EditorMenuItem) {
  return item.kind === 'navigation' ? 'navigation' : item.label;
}

function MenuHeading({ bar }: { bar: PhoneBar }) {
  return (
    <div data-testid="editor-phone-menu-heading" className="grid gap-2 px-3 pt-2 pb-3">
      <div className="grid gap-0.5">
        <p className="text-base leading-snug font-semibold">{bar.heading}</p>
        {bar.subtitle && <p className="text-sm text-muted-foreground">{bar.subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {bar.badges.map((badge) => (
          <StateBadge key={badge.label} badge={badge} />
        ))}
        {bar.status && (
          <span
            data-testid="editor-phone-status"
            className={cn(
              'text-sm',
              bar.status.tone === 'warning' ? 'text-warning-foreground' : 'text-muted-foreground'
            )}
          >
            {bar.status.text}
          </span>
        )}
      </div>
      {bar.note && (
        <p
          data-testid="editor-phone-note"
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {bar.note}
        </p>
      )}
    </div>
  );
}

function StateBadge({ badge }: { badge: EditorBadge }) {
  return (
    <Badge
      variant={badge.variant === 'warning' ? 'outline' : badge.variant}
      className={cn('text-sm', badge.variant === 'warning' && warningBadge)}
    >
      {badge.label}
    </Badge>
  );
}

function MenuItem({
  item,
  navigation,
}: {
  item: EditorMenuItem;
  navigation: { open: boolean; toggle: () => void };
}) {
  if (item.kind === 'navigation') {
    return (
      <DropdownMenuItem
        data-testid="editor-phone-navigation"
        className={itemClassName}
        onSelect={navigation.toggle}
      >
        <TableOfContents aria-hidden="true" />
        {navigation.open ? 'Închide cuprinsul și căutarea' : 'Cuprins și căutare'}
      </DropdownMenuItem>
    );
  }
  const content: ReactNode = (
    <>
      <item.icon aria-hidden="true" />
      {item.label}
    </>
  );
  if (item.kind === 'link') {
    return (
      <DropdownMenuItem asChild className={itemClassName}>
        {item.link(content)}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      data-testid={item.testId}
      className={itemClassName}
      disabled={item.disabled}
      onSelect={item.onSelect}
    >
      {content}
    </DropdownMenuItem>
  );
}

function HistoryButtons() {
  const undo = useEditorCommand('history.undo');
  const redo = useEditorCommand('history.redo');
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        data-testid="editor-phone-undo"
        className={iconButton}
        aria-label="Anulează"
        disabled={!undo.isEnabled}
        onMouseDown={keepSelection}
        onClick={() => undo.execute()}
      >
        <Undo2 className="size-5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        data-testid="editor-phone-redo"
        className={iconButton}
        aria-label="Refă"
        disabled={!redo.isEnabled}
        onMouseDown={keepSelection}
        onClick={() => redo.execute()}
      >
        <Redo2 className="size-5" aria-hidden="true" />
      </Button>
    </>
  );
}

// The packaged toolbar takes no parts, so a phone gets its own, without what the bar above
// already offers (undo, redo) or what a draft never needs (the editing mode, and comments, which
// need a module the app does not load).
function FormattingToolbar() {
  const t = useChromeTranslate();
  return (
    <div className="px-3 py-2">
      <DocxEditor.Toolbar t={t}>
        <DocxEditor.Toolbar.Undo hidden />
        <DocxEditor.Toolbar.Redo hidden />
        <DocxEditor.Toolbar.EditingMode hidden />
        <DocxEditor.Toolbar.Comments hidden />
      </DocxEditor.Toolbar>
    </div>
  );
}

// Under the bars rather than at the bottom, where the keyboard opens while the person types, and
// above the page rather than over it, where it would hide the mark it has just selected.
function UnfilledStrip({ marks }: { marks: UnfilledMarks }) {
  return (
    <div
      role="region"
      aria-label="Locuri de completat"
      data-testid="editor-phone-stepper"
      className="mx-2 mb-2 flex items-center gap-3 rounded-lg border border-warning-border bg-warning py-2 pr-1 pl-3 font-sans text-warning-foreground"
    >
      <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
      <div className="grid min-w-0 flex-1 text-sm leading-snug">
        <span data-testid="editor-phone-stepper-place" className="font-semibold">
          {marks.active >= 0
            ? `Locul ${marks.active + 1} din ${marks.count}`
            : `${countOf(marks.count, 'loc', 'locuri')} de completat`}
        </span>
        <span>Ce scrii acolo îl înlocuiește.</span>
      </div>
      <Button
        data-testid="editor-phone-stepper-next"
        className={cn('shrink-0', darkButton)}
        onMouseDown={keepSelection}
        onClick={marks.next}
      >
        Următorul
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        data-testid="editor-phone-stepper-close"
        className="size-11 shrink-0 text-warning-foreground hover:bg-warning-border/40 hover:text-warning-foreground focus-visible:ring-brand-forest/40"
        aria-label="Închide"
        onClick={marks.stopStepping}
      >
        <X className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}
