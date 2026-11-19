import type { ImportKind } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { Building2, ChevronDown, FilePen, type LucideIcon, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { useCreditsBalance } from '../use-credits-balance';
import { CreditsAvailable } from './imports-credits';
import type { NewImportWay } from './use-new-import';

const clientWays: { way: NewImportWay; label: string; icon: LucideIcon; testId: string }[] = [
  {
    way: 'new',
    label: 'Client nou din documente',
    icon: Building2,
    testId: 'imports-new-client',
  },
  {
    way: 'complete',
    label: 'Completează un client din documente',
    icon: FilePen,
    testId: 'imports-complete-client',
  },
];

const buttonClass = 'h-11 w-full md:h-9 md:w-auto';

export function NewImportButton({
  kind,
  onStart,
}: {
  kind: ImportKind;
  onStart: (way: NewImportWay) => void;
}) {
  const phone = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { balance } = useCreditsBalance();
  if (kind === 'employees') {
    return (
      <Button
        className={buttonClass}
        data-testid="imports-new"
        onClick={() => onStart('employees')}
      >
        <Plus aria-hidden="true" />
        Import nou
      </Button>
    );
  }
  const face = (
    <>
      <Plus aria-hidden="true" />
      Import nou
      <ChevronDown aria-hidden="true" className="opacity-70" />
    </>
  );
  if (phone) {
    return (
      <>
        <Button
          className={buttonClass}
          data-testid="imports-new"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          {face}
        </Button>
        <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
          <DrawerContent data-testid="imports-new-menu" className="h-auto max-h-[85dvh] bg-card">
            <DrawerHeader className="justify-between pt-2 pr-2 pb-0">
              <DrawerTitle className="text-[17px] font-semibold">Import nou</DrawerTitle>
              <DrawerClose
                aria-label="Închide"
                className="grid size-11 place-items-center rounded-[10px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X aria-hidden="true" className="size-5" />
              </DrawerClose>
            </DrawerHeader>
            <DrawerBody className="px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
              {clientWays.map(({ way, label, icon: Icon, testId }) => (
                <button
                  key={way}
                  type="button"
                  data-testid={testId}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[15px] outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    setMenuOpen(false);
                    onStart(way);
                  }}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  {label}
                </button>
              ))}
              {balance && (
                <CreditsAvailable
                  balance={balance}
                  lead="remain"
                  className="-mx-2 mt-2 border-t bg-muted/40 px-4 py-2.5 text-[13px] text-muted-foreground"
                />
              )}
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={buttonClass} data-testid="imports-new">
          {face}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid="imports-new-menu" align="end" className="w-80">
        {clientWays.map(({ way, label, icon: Icon, testId }) => (
          <DropdownMenuItem
            key={way}
            data-testid={testId}
            className="py-2"
            onSelect={() => onStart(way)}
          >
            <Icon aria-hidden="true" />
            {label}
          </DropdownMenuItem>
        ))}
        {balance && (
          <>
            <DropdownMenuSeparator />
            <CreditsAvailable
              balance={balance}
              lead="remain"
              className="px-2 py-1.5 text-[13px] text-muted-foreground"
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
