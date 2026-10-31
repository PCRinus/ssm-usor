import { createContext } from 'react';

export const ShowPageContext = createContext<(pageId: string) => void>(() => undefined);
