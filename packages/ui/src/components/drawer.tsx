'use client';

import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { cn } from 'cn';
import * as React from 'react';

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root {...props} />;
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerContent({
  className,
  children,
  ...props
}: Omit<DrawerPrimitive.Popup.Props, 'className'> & { className?: string }) {
  return (
    <DrawerPrimitive.VirtualKeyboardProvider>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop
          data-slot="drawer-overlay"
          className="fixed inset-0 z-50 bg-foreground/30 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0"
        />
        <DrawerPrimitive.Viewport
          data-slot="drawer-viewport"
          className="fixed inset-0 z-50 flex items-end justify-center"
        >
          <DrawerPrimitive.Popup
            data-slot="drawer-content"
            className={cn(
              'flex h-[92dvh] w-full flex-col rounded-t-2xl bg-background shadow-[0_-12px_40px_rgb(24_52_46/0.2)] outline-none [transform:translateY(var(--drawer-swipe-movement-y,0))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-starting-style:[transform:translateY(100%)] data-swiping:select-none',
              className
            )}
            {...props}
          >
            <div
              aria-hidden="true"
              data-slot="drawer-handle"
              className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-input"
            />
            {children}
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.VirtualKeyboardProvider>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-1.5', className)}
      {...props}
    />
  );
}

// Swiping here would fight the scroll of a long body, so only the handle, header and footer
// drag the drawer.
function DrawerBody({
  className,
  ...props
}: Omit<DrawerPrimitive.Content.Props, 'className'> & { className?: string }) {
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-body"
      data-base-ui-swipe-ignore=""
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4', className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        'grid shrink-0 gap-2 border-t bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
        className
      )}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: Omit<DrawerPrimitive.Title.Props, 'className'> & { className?: string }) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-base font-medium text-foreground', className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: Omit<DrawerPrimitive.Description.Props, 'className'> & { className?: string }) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
};
