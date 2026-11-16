import { createContext, useContext } from 'react';

export interface InstructionStart {
  start: () => void;
  // While the open tab has no active instruction, its message holds "Scrie o instrucțiune" in
  // place of the page's button.
  setTabEmpty: (empty: boolean) => void;
}

export const InstructionStartContext = createContext<InstructionStart>({
  start: () => undefined,
  setTabEmpty: () => undefined,
});

export const useInstructionStart = () => useContext(InstructionStartContext);
