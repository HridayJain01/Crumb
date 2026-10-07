import type { ReactNode } from 'react';
import { Drawer } from 'vaul';

/** Bottom sheet (drag to dismiss) used for confirmation, editing and planners. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible}
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-sheet bg-bg outline-none"
          aria-describedby={description ? undefined : undefined}
        >
          <Drawer.Handle className="mx-auto mt-3 mb-1 !h-1.5 !w-12 !rounded-full !bg-line" />
          <div className="px-5 pt-2 pb-3">
            <Drawer.Title className="text-xl font-extrabold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-0.5 text-sm font-semibold text-muted">
                {description}
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && (
            <div className="border-t border-line bg-bg px-5 pt-3 safe-bottom">{footer}</div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
