/** OCR receipt scanning via OpenRouter, BYO key (PRD §4.5, §6). */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { fromMinor } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { extractReceipt, OcrError, DEFAULT_OCR_MODEL } from '../ocr/openrouter-adapter.js';
import { parseImageDataUrl } from '../storage/object-store.js';

export const ocrRouter = router({
  scan: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        imageDataUrl: z.string().startsWith('data:image/'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);

      if (ctx.ocrRateLimit && !ctx.ocrRateLimit.check(ctx.user.id)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many receipt scans; please wait a moment and try again.',
        });
      }

      const group = await ctx.prisma.group.findUniqueOrThrow({
        where: { id: input.groupId },
        select: { baseCurrency: true },
      });
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { openRouterKeyEncrypted: true, ocrModel: true, isVip: true },
      });

      // Key resolution (FR-5.2 + hosted VIP tier): a user's own BYO key wins for
      // everyone; otherwise a VIP may use the shared instance key; otherwise OCR
      // is unavailable. Receipt-image storage is a separate VIP-only privilege.
      let apiKey: string;
      let model: string;
      if (user.openRouterKeyEncrypted) {
        apiKey = ctx.secretBox.decrypt(user.openRouterKeyEncrypted);
        model = user.ocrModel ?? DEFAULT_OCR_MODEL;
      } else if (user.isVip) {
        const cfg = await ctx.prisma.instanceConfig.findUnique({ where: { id: 'singleton' } });
        if (!cfg?.openRouterKeyEncrypted) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'No shared OpenRouter key is configured; ask an admin.',
          });
        }
        apiKey = ctx.secretBox.decrypt(cfg.openRouterKeyEncrypted);
        model = user.ocrModel ?? cfg.ocrModel ?? DEFAULT_OCR_MODEL;
      } else {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Add your OpenRouter API key in settings, or ask an admin for VIP access.',
        });
      }

      try {
        const result = await extractReceipt({
          imageDataUrl: input.imageDataUrl,
          apiKey,
          model,
          baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
          fallbackCurrency: group.baseCurrency,
          fetchImpl: ctx.ocrFetch,
        });

        // Best-effort image storage (FR-5.8): a storage failure must never block
        // OCR. Storing the receipt photo is a VIP-only privilege.
        let storageKey = '';
        const parsedRetentionDays = Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10);
        const retentionDays = Number.isFinite(parsedRetentionDays) ? parsedRetentionDays : 30;
        if (ctx.objectStore && user.isVip) {
          try {
            const { bytes, contentType, ext } = parseImageDataUrl(input.imageDataUrl);
            const key = `receipts/${input.groupId}/${crypto.randomUUID()}.${ext}`;
            await ctx.objectStore.putReceipt(key, bytes, contentType);
            storageKey = key;
            if (retentionDays === 0) {
              await ctx.objectStore.deleteObject(key);
              storageKey = '';
            }
          } catch (err) {
            console.warn('[ocr] receipt storage failed (best-effort)', err);
            storageKey = ''; // storage is best-effort
          }
        }

        const receipt = await ctx.prisma.receipt.create({
          data: {
            groupId: input.groupId,
            storageKey,
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
        // Record the failure and tell the client to fall back to manual entry (FR-5.6/5.7).
        await ctx.prisma.receipt.create({
          data: {
            groupId: input.groupId,
            storageKey: '',
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
