import { countOf, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, X } from 'lucide-react';
import { useId, useState } from 'react';

import { SearchInput } from '@/components/search-input';

import { type PickedClient, useActiveClients } from './use-active-clients';

export function ClientPicker({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (client: PickedClient) => void;
}) {
  const phone = useIsMobile();
  // Each opening starts afresh, while the closing sheet keeps what it showed as it slides away.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((count) => count + 1);
  }
  const body = (
    <PickerBody key={opening} title={title} phone={phone} onClose={onClose} onPick={onPick} />
  );
  if (phone) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
        <DrawerContent data-testid="imports-client-picker" className="h-auto max-h-[92dvh] bg-card">
          {body}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="imports-client-picker"
        aria-describedby={undefined}
        className="sm:max-w-[32rem]"
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  title,
  phone,
  onClose,
  onPick,
}: {
  title: string;
  phone: boolean;
  onClose: () => void;
  onPick: (client: PickedClient) => void;
}) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PickedClient | null>(null);
  const clients = useActiveClients(q || undefined);
  const items = clients.data?.items ?? [];
  const chosen = picked && items.some((client) => client.id === picked.id) ? picked : null;
  const capped = (clients.data?.total ?? 0) > items.length;
  const labelId = useId();
  const name = useId();

  const list = (
    <div className="grid gap-2">
      <span id={labelId} className="text-sm font-medium">
        Clientul
      </span>
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b p-2">
          <SearchInput
            value={q}
            onSearch={setQ}
            placeholder="Caută după nume sau CUI"
            label="Caută clientul după nume sau CUI"
            testId="imports-client-search"
            className="sm:max-w-none"
          />
        </div>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="grid max-h-[min(18rem,45svh)] gap-0.5 overflow-y-auto p-1"
        >
          {clients.isSuccess && items.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {q ? `Niciun client nu se potrivește cu „${q}”.` : 'Nu ai încă niciun client activ.'}
            </p>
          )}
          {clients.isError && (
            <p className="px-3 py-4 text-sm text-destructive">
              Nu am putut încărca clienții. Încearcă din nou.
            </p>
          )}
          {items.map((client) => {
            const selected = chosen?.id === client.id;
            return (
              <label
                key={client.id}
                className="relative grid cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-3 rounded-md px-3 py-2 hover:bg-muted/60 has-checked:bg-muted has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name={name}
                  value={client.id}
                  checked={selected}
                  data-testid="imports-client-option"
                  onChange={() => setPicked(client)}
                  className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{client.legalName}</span>
                  <span className="block text-[13px] text-muted-foreground tabular-nums">
                    CUI {formatCui(client.cui, client.vatPayer)} ·{' '}
                    {countOf(client.currentEmployeeCount, 'lucrător', 'lucrători')}
                  </span>
                </span>
                {selected && <Check aria-hidden="true" className="size-4" />}
              </label>
            );
          })}
          {capped && (
            <p
              data-testid="imports-client-capped"
              className="px-3 py-2 text-[13px] text-muted-foreground"
            >
              Se văd primii {countOf(items.length, 'client', 'clienți')}. Caută-l pe cel pe care
              nu-l găsești.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const actions = (
    <>
      <Button
        className={cn(phone && 'h-11')}
        data-testid="imports-client-continue"
        disabled={!chosen}
        onClick={() => chosen && onPick(chosen)}
      >
        Continuă
      </Button>
      <Button variant="ghost" className={cn(phone && 'h-11')} onClick={onClose}>
        Renunță
      </Button>
    </>
  );

  if (phone) {
    return (
      <>
        <DrawerHeader className="justify-between pt-2 pr-2 pb-0">
          <DrawerTitle className="text-[17px] font-semibold">{title}</DrawerTitle>
          <DrawerClose
            aria-label="Închide"
            className="grid size-11 place-items-center rounded-[10px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X aria-hidden="true" className="size-5" />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody className="pt-2 pb-4">{list}</DrawerBody>
        <DrawerFooter>{actions}</DrawerFooter>
      </>
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="mt-2">{list}</DialogBody>
      <DialogFooter className="mt-2 sm:flex-row-reverse sm:justify-start">{actions}</DialogFooter>
    </>
  );
}
