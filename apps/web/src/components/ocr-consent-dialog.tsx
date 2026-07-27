'use client';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { Modal } from '@/components/modal';

/**
 * One-time consent before a receipt image is sent to the OCR provider.
 * Opt-in rather than implied because a receipt can disclose special-category
 * data under GDPR Art. 9 (a pharmacy purchase reveals health information) and
 * the image leaves the EU. Revocable from Settings.
 *
 * Built on the shared `Modal` (native `<dialog>` + `showModal()`) so it gets a
 * real focus trap, Escape-to-close, click-outside and initial focus for free —
 * this is the most legally sensitive dialog in the app, so it must not merely
 * *claim* modality via `aria-modal`.
 */
export function OcrConsentDialog({
  onAccept,
  onCancel,
  pending,
  error,
}: {
  onAccept: () => void;
  onCancel: () => void;
  pending: boolean;
  error?: string | null;
}) {
  const { t } = useI18n();
  return (
    <Modal open onClose={onCancel} title={t('ocr.consent.title')} testId="ocr-consent-dialog">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{t('ocr.consent.body')}</p>
      {error ? (
        <p
          role="alert"
          className="mt-3 text-sm font-medium text-red-700 dark:text-red-400"
          data-testid="ocr-consent-error"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          className="flex-1"
          data-testid="ocr-consent-cancel"
        >
          {t('ocr.consent.cancel')}
        </Button>
        <Button
          type="button"
          onClick={onAccept}
          disabled={pending}
          className="flex-1"
          data-testid="ocr-consent-accept"
        >
          {t('ocr.consent.accept')}
        </Button>
      </div>
    </Modal>
  );
}
