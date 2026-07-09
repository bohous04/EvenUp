'use client';
import { useState } from 'react';
import { CUSTOM_CATEGORY_ICONS } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, EmptyState, Input, Label, iconButtonClass } from '@/components/ui';
import { CategoryIcon, Check, Pencil, Trash2, X } from '@/components/icons';

/** Manage a group's custom categories (list + add + rename + delete). */
export function CategoryManager({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const list = trpc.category.list.useQuery({ groupId });
  const invalidate = () => {
    void utils.category.list.invalidate({ groupId });
    void utils.activity.list.invalidate({ groupId });
  };
  const create = trpc.category.create.useMutation({
    onSuccess: () => {
      setName('');
      setIconName(CUSTOM_CATEGORY_ICONS[0]!);
      setError(null);
      invalidate();
    },
    onError: (e) =>
      setError(e.data?.code === 'CONFLICT' ? t('category.custom.duplicate') : e.message),
  });
  const update = trpc.category.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: (e) =>
      setError(e.data?.code === 'CONFLICT' ? t('category.custom.duplicate') : e.message),
  });
  const remove = trpc.category.remove.useMutation({
    onSuccess: () => {
      invalidate();
      void utils.stats.byCategory.invalidate({ groupId });
    },
    onError: (e) =>
      setError(e.data?.code === 'CONFLICT' ? t('category.custom.duplicate') : e.message),
  });

  const [name, setName] = useState('');
  const [iconName, setIconName] = useState(CUSTOM_CATEGORY_ICONS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const iconGrid = (selected: string, onPick: (icon: string) => void) => (
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('category.custom.icon')}>
      {CUSTOM_CATEGORY_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          role="radio"
          aria-checked={selected === icon}
          aria-label={icon}
          onClick={() => onPick(icon)}
          data-testid={`category-icon-${icon}`}
          className={`flex items-center justify-center rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
            selected === icon
              ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          <CategoryIcon name={icon} size={18} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {list.data && list.data.length > 0 ? (
        <ul className="space-y-1">
          {list.data.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1" data-testid={`category-row-${c.id}`}>
              <span className="text-zinc-600 dark:text-zinc-300">
                <CategoryIcon name={c.iconName} size={18} />
              </span>
              {editingId === c.id ? (
                <>
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={t('category.custom.name')}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => draft.trim() && update.mutate({ categoryId: c.id, name: draft.trim() })}
                    aria-label={t('common.save')}
                    className={iconButtonClass}
                  >
                    <Check size={16} aria-hidden />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} aria-label={t('common.cancel')} className={iconButtonClass}>
                    <X size={16} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setDraft(c.name);
                    }}
                    aria-label={`${t('common.edit')} — ${c.name}`}
                    data-testid={`category-rename-${c.id}`}
                    className={iconButtonClass}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('category.custom.deleteConfirm'))) {
                        remove.mutate({ categoryId: c.id });
                      }
                    }}
                    aria-label={`${t('common.delete')} — ${c.name}`}
                    data-testid={`category-delete-${c.id}`}
                    className={iconButtonClass}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('category.custom.empty')} />
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <form
        className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ groupId, name: name.trim(), iconName });
        }}
      >
        <div>
          <Label htmlFor="cat-name">{t('category.custom.name')}</Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="category-name-input"
          />
        </div>
        {iconGrid(iconName, setIconName)}
        <Button type="submit" disabled={create.isPending} data-testid="category-add-btn">
          {create.isPending ? t('common.loading') : t('category.custom.add')}
        </Button>
      </form>
    </div>
  );
}
