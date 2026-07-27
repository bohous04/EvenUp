/** OCR receipt scanning via OpenRouter, using the shared instance key, metered by entitlement (PRD §4.5, §6). */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { fromMinor } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { extractReceipt, OcrError, DEFAULT_OCR_MODEL } from '../ocr/openrouter-adapter.js';
import { parseDataUrl } from '../storage/object-store.js';
import { loadEntitlement } from '../billing/scan-access.js';
import { reserveCredit, refundCredit, recordVipScan } from '../billing/ledger.js';
import { receiptRetentionDays } from '../config/retention.js';

const MAX_PAGES = 10;
// ~15 MB decoded; clears the client 10 MB PDF guard with margin while bounding abuse.
const MAX_PAGE_DATA_URL_CHARS = 20_000_000;

export const ocrRouter = router({
  scan: protectedProcedure
    .input(
      z.union([
        z.object({
          groupId: z.string(),
          imageDataUrl: z.string().startsWith('data:image/').max(MAX_PAGE_DATA_URL_CHARS),
          // UI language to translate item names into (best-effort).
          lang: z.string().max(5).optional(),
        }),
        z.object({
          groupId: z.string(),
          pages: z
            .array(
              z
                .string()
                .regex(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/)
                .max(MAX_PAGE_DATA_URL_CHARS),
            )
            .min(1)
            .max(MAX_PAGES),
          lang: z.string().max(5).optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const groupId = input.groupId;
      const pages = 'pages' in input ? input.pages : [input.imageDataUrl];
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { ocrModel: true, ocrConsentAt: true },
      });

      // Explicit, revocable consent gate (GDPR Art. 9): a receipt can disclose
      // special-category data (e.g. a pharmacy purchase reveals health
      // information) and is sent to a third-party AI provider, so this must be
      // checked before anything else that spends money or calls out.
      if (!user.ocrConsentAt) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Receipt scanning requires your consent to send the image to our OCR provider.',
        });
      }

      if (ctx.ocrRateLimit && !ctx.ocrRateLimit.check(ctx.user.id)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many receipt scans; please wait a moment and try again.',
        });
      }

      const group = await ctx.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { baseCurrency: true },
      });

      // Entitlement (paid tiers) replaces the old BYO-key resolution: the
      // instance key is the only key now, and access is metered.
      const entitlement = await loadEntitlement(ctx.prisma, ctx.user.id, new Date());
      if (!entitlement.allow) {
        throw new TRPCError({
          code: 'PAYMENT_REQUIRED',
          message: 'No scans remaining. Subscribe or buy credits to continue.',
        });
      }

      const cfg = await ctx.prisma.instanceConfig.findUnique({ where: { id: 'singleton' } });
      if (!cfg?.openRouterKeyEncrypted) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No shared OpenRouter key is configured; ask an admin.',
        });
      }
      const apiKey = ctx.secretBox.decrypt(cfg.openRouterKeyEncrypted);
      const model = user.ocrModel ?? cfg.ocrModel ?? DEFAULT_OCR_MODEL;

      // Reserve before spending money at OpenRouter so concurrent scans cannot
      // overdraw a single credit. Refunded below if the scan throws.
      if (entitlement.consume === 'CREDIT') {
        const reserved = await reserveCredit(ctx.prisma, ctx.user.id);
        if (!reserved) {
          throw new TRPCError({
            code: 'PAYMENT_REQUIRED',
            message: 'No scans remaining. Subscribe or buy credits to continue.',
          });
        }
      }

      try {
        const result = await extractReceipt({
          pages,
          apiKey,
          model,
          baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
          fallbackCurrency: group.baseCurrency,
          fetchImpl: ctx.ocrFetch,
          pdfEngine: process.env.OCR_PDF_ENGINE || undefined,
          targetLang: input.lang,
        });

        if (entitlement.consume === 'VIP_SCAN') {
          await recordVipScan(ctx.prisma, ctx.user.id);
        }

        // Best-effort image storage (FR-5.8): a storage failure must never block
        // OCR. Storing the receipt photo is subscription-scoped (mayStoreImage),
        // not comp-VIP-scoped.
        const storageKeys: string[] = [];
        const retentionDays = receiptRetentionDays();
        if (ctx.objectStore && entitlement.mayStoreImage) {
          for (const page of pages) {
            try {
              const { bytes, contentType, ext } = parseDataUrl(page);
              const key = `receipts/${groupId}/${crypto.randomUUID()}.${ext}`;
              await ctx.objectStore.putReceipt(key, bytes, contentType);
              if (retentionDays === 0) {
                await ctx.objectStore.deleteObject(key);
              } else {
                storageKeys.push(key);
              }
            } catch (err) {
              console.warn('[ocr] receipt storage failed (best-effort)', err);
            }
          }
        }

        const receipt = await ctx.prisma.receipt.create({
          data: {
            groupId,
            storageKeys,
            ocrModel: model,
            status: 'COMPLETED',
            rawJson: result as unknown as object,
            merchant: result.merchant,
            detectedCurrency: result.currency,
            detectedTotalMinorUnits: fromMinor(result.totalMinorUnits),
            confidence: result.confidence,
          },
        });
        return { receiptId: receipt.id, result };
      } catch (err) {
        if (entitlement.consume === 'CREDIT') {
          await refundCredit(ctx.prisma, ctx.user.id);
        }
        // Log the real reason server-side (the client only ever sees a generic
        // fallback message) so failures are diagnosable from the app logs.
        console.error('[ocr] extractReceipt failed:', err instanceof Error ? err.message : err);
        // Record the failure and tell the client to fall back to manual entry (FR-5.6/5.7).
        await ctx.prisma.receipt.create({
          data: {
            groupId,
            storageKeys: [],
            ocrModel: model,
            status: 'FAILED',
          },
        });
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message:
            err instanceof OcrError
              ? 'Receipt could not be read; please enter the items manually.'
              : 'OCR failed; please enter the items manually.',
          cause: err,
        });
      }
    }),
});
