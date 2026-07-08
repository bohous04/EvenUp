'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Input, iconButtonClass } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { Pencil, Check, X } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

const iconButton = `${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-40`;

/**
 * Member roster with inline rename. Renders one row per member; the pencil
 * swaps a single row into an editor that calls `member.update` (which re-derives
 * initials and logs the change server-side). Only one row edits at a time.
 */
export function MemberList({ groupId, members }: { groupId: string; members: MemberLite[] }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const update = trpc.member.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      setDraft('');
      void utils.group.get.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
    },
  });

  function startEdit(m: MemberLite) {
    setEditingId(m.id);
    setDraft(m.displayName);
  }

  function cancel() {
    setEditingId(null);
    setDraft('');
  }

  function save(memberId: string) {
    const name = draft.trim();
    if (!name) return;
    update.mutate({ memberId, displayName: name });
  }

  return (
    <ul className="mb-3 space-y-0.5" data-testid="member-list">
      {members.map((m) => {
        const editing = editingId === m.id;
        return (
          <li key={m.id} className="flex items-center gap-2 py-1">
            <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
            {editing ? (
              <>
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      save(m.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancel();
                    }
                  }}
                  aria-label={t('member.name')}
                  className="flex-1"
                  data-testid="member-rename-input"
                />
                <button
                  type="button"
                  onClick={() => save(m.id)}
                  disabled={update.isPending || draft.trim().length === 0}
                  aria-label={t('common.save')}
                  title={t('common.save')}
                  className={iconButton}
                  data-testid="member-rename-save"
                >
                  <Check size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label={t('common.cancel')}
                  title={t('common.cancel')}
                  className={iconButton}
                  data-testid="member-rename-cancel"
                >
                  <X size={16} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm">{m.displayName}</span>
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  aria-label={`${t('common.edit')} — ${m.displayName}`}
                  title={t('common.edit')}
                  className={iconButton}
                >
                  <Pencil size={16} aria-hidden />
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
