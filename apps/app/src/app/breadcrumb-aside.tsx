import { type ReactNode, use } from 'react';
import { createPortal } from 'react-dom';

import { BreadcrumbAsideContext } from './breadcrumb-aside-context';

export function BreadcrumbAside({ children }: { children: ReactNode }) {
  const slot = use(BreadcrumbAsideContext);
  return slot ? createPortal(children, slot) : null;
}
