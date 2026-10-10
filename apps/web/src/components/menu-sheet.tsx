'use client';
import { Sheet } from '@/components/sheet';
import { ChevronRight, type LucideIcon } from '@/components/icons';

export interface MenuSheetItem {
  key: string;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}

/** A sheet of tappable rows — the redesign's "⋯" menu on mobile and desktop. */
export function MenuSheet({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: MenuSheetItem[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} testId="group-menu">
      <ul className="-mx-4 sm:-mx-6">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={it.onSelect}
              data-testid={`menu-${it.key}`}
              className="app-row flex min-h-14 w-full items-center gap-4 px-4 text-left text-[0.9375rem] font-medium tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:px-6"
            >
              <it.icon
                size={20}
                strokeWidth={1.75}
                aria-hidden
                className="text-zinc-500 dark:text-zinc-400"
              />
              <span className="flex-1">{it.label}</span>
              <ChevronRight size={18} aria-hidden className="text-zinc-400 dark:text-zinc-500" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
