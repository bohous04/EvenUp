'use client';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui';

/**
 * One-time consent before a receipt image is sent to the OCR provider.
 * Opt-in rather than implied because a receipt can disclose special-category
 * data under GDPR Art. 9 (a pharmacy purchase reveals health information) and
 * the image leaves the EU. Revocable from Settings.
 *
 * Plain overlay (not the shared `Modal`/`Sheet`) because those wrap the native
 * `<dialog>` element's `showModal()`, which jsdom doesn't implement — this
 * component needs to render reliably under Vitest + Testing Library.
 */
export function OcrConsentDialog({
  onAccept,
  onCancel,
  pending,
}: {
  onAccept: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-consent-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <h2 id="ocr-consent-title" className="text-lg font-bold">
          {t('ocr.consent.title')}
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{t('ocr.consent.body')}</p>
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
      </div>
    </div>
  );
}
