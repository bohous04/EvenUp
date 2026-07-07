'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Input } from '@/components/ui';

export function AddMemberForm({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [name, setName] = useState('');
  const addMember = trpc.member.add.useMutation({
    onSuccess: () => {
      setName('');
      void utils.group.get.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
    },
  });

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) addMember.mutate({ groupId, displayName: name.trim() });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('member.name')}
        aria-label={t('member.add')}
        data-testid="member-name-input"
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={addMember.isPending}
        data-testid="add-member-btn"
      >
        {t('common.add')}
      </Button>
    </form>
  );
}
