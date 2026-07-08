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
      <ul className="-mx-2">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={it.onSelect}
              data-testid={`menu-${it.key}`}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
            >
              <it.icon size={18} aria-hidden className="text-zinc-400 dark:text-zinc-500" />
              <span className="flex-1">{it.label}</span>
              <ChevronRight size={16} aria-hidden className="text-zinc-300 dark:text-zinc-600" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
