import type { ImportKind } from '@ssm-usor/contracts';
import { useBlocker } from '@tanstack/react-router';
import { type FormEvent, useRef, useState } from 'react';

import { useRefuseStrayDrops } from '@/features/client-files/use-file-drop';

import { creditsRefusal, refusalFromApi } from './import-credits';
import {
  emptySelection,
  mergeSelection,
  openPicked,
  type PickedFile,
  type Selection,
  selectionTotals,
  withCopiesAside,
} from './upload-selection';
import { useCreditsBalance } from './use-credits-balance';
import { useImportDrop } from './use-import-drop';
import { busySteps, choosingSteps, heldSteps, useImportUpload } from './use-import-upload';

// Sheets the import takes from elsewhere, as the documentation's found sheets.
type AddedSheet = { id: string; sizeBytes: number; pages: number };

const noSheets: AddedSheet[] = [];

export function useUploadForm({
  kind,
  clientId,
  onStarted,
  onClose,
  leaveWhileBusy,
  creditsNeeded,
  addedSheets = noSheets,
}: {
  kind: ImportKind;
  clientId: string | undefined;
  onStarted: (importId: string) => void;
  onClose: () => void;
  leaveWhileBusy: string;
  creditsNeeded: (selection: Selection) => number;
  addedSheets?: AddedSheet[];
}) {
  const [chosen, setChosen] = useState<Selection>(emptySelection);
  const selection = withCopiesAside(chosen);
  const [opening, setOpening] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const openingImport = useRef(false);
  const { phase, upload, retry, continueWithout, abandon, forgetShort } = useImportUpload(
    clientId,
    (id) => {
      openingImport.current = true;
      onStarted(id);
    },
    kind
  );
  const busy = busySteps.has(phase.step);
  const choosing = choosingSteps.has(phase.step);
  const addedBytes = addedSheets.reduce((total, sheet) => total + sheet.sizeBytes, 0);
  const totals = selectionTotals(selection, kind, {
    count: addedSheets.length,
    pages: addedSheets.reduce((total, sheet) => total + sheet.pages, 0),
    bytes: addedBytes,
  });
  const over = totals.overFiles || totals.overBytes;
  const { balance, isOwner } = useCreditsBalance();
  const refusal =
    phase.step === 'short'
      ? refusalFromApi(phase.credits)
      : choosing
        ? creditsRefusal(balance, creditsNeeded(selection))
        : null;
  useRefuseStrayDrops();

  async function add(picked: Promise<PickedFile[]> | PickedFile[]) {
    setOpening(true);
    setUnreadable(false);
    try {
      const added = await openPicked(await picked, kind);
      forgetShort();
      setChosen((current) => mergeSelection(current, added));
    } catch {
      setUnreadable(true);
    } finally {
      setOpening(false);
    }
  }

  const drop = useImportDrop((picked) => {
    if (!opening) void add(picked);
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (totals.count === 0 || over || opening || refusal) return;
    void upload(selection.files, { ids: addedSheets.map((sheet) => sheet.id), bytes: addedBytes });
  }

  // No closing while files go up: the import would stay half uploaded.
  const holdOpen = (event: Event) => {
    if (busy) event.preventDefault();
  };

  useBlocker({
    shouldBlockFn: () => {
      if (openingImport.current || (!busy && !heldSteps.has(phase.step))) return false;
      if (busy && !window.confirm(leaveWhileBusy)) return true;
      leave();
      return false;
    },
    enableBeforeUnload: () => busy,
  });

  // Elsewhere an import still uploading can only be abandoned, so leaving it here ends it.
  function leave() {
    if (busy || heldSteps.has(phase.step)) abandon();
    onClose();
  }

  return {
    selection,
    setChosen,
    totals,
    over,
    opening,
    unreadable,
    add,
    drop,
    phase,
    retry,
    continueWithout,
    forgetShort,
    busy,
    choosing,
    refusal,
    balance,
    isOwner,
    onSubmit,
    holdOpen,
    leave,
  };
}
