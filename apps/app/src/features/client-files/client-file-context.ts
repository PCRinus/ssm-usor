import { createContext, useContext } from 'react';

import type { ClientFile } from './client-file-format';
import type { FileAnchor } from './client-file-row';
import type { FolderZips } from './import-folder';

export interface ClientFileListContext {
  clientId: string;
  showOwnersOnly: boolean;
  canSwitch: boolean;
  readOnly: boolean;
  switching: readonly string[];
  zips: FolderZips;
  open: (file: ClientFile) => FileAnchor;
  download: (file: ClientFile) => FileAnchor;
  onToggle: (key: string) => void;
  onShowAll: (key: string) => void;
  onRename: (file: ClientFile) => void;
  onDelete: (file: ClientFile) => void;
  onOwnersOnly: (file: ClientFile, ownersOnly: boolean) => void;
}

// The table renders each cell function as a component, so columns made again on every render
// would remount every cell; they stay fixed and read what changes from here.
export const ClientFileList = createContext<ClientFileListContext | null>(null);

export function useClientFileList() {
  const context = useContext(ClientFileList);
  if (!context) throw new Error('A client file cell renders outside its list.');
  return context;
}
