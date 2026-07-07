'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { Check } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
}

/** Save a member's IBAN (encrypted server-side) for SPAYD QR payments (FR-7.2). */
export function BankDetailsForm({ members }: { members: MemberLite[] }) {
  const { t } = useI18n();
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const [iban, setIban] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setBankDetail = trpc.member.setBankDetail.useMutation({
    onSuccess: () => {
      setSaved(true);
      setIban('');
      setError(null);
    },
    onError: (e) => {
      setError(e.message);
      setSaved(false);
    },
  });

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('member.iban')}</h3>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (iban.trim()) setBankDetail.mutate({ memberId, iban: iban.trim() });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="bank-member">{t('group.members')}</Label>
            <Select
              id="bank-member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              data-testid="bank-member-select"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bank-iban">IBAN</Label>
            <Input
              id="bank-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="CZ65 0800 0000 1920 0014 5399"
              data-testid="bank-iban-input"
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
            <Check size={16} aria-hidden /> {t('common.save')}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          disabled={setBankDetail.isPending}
          data-testid="bank-save-btn"
        >
          {t('common.save')}
        </Button>
      </form>
    </Card>
  );
}
