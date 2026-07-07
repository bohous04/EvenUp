/**
 * Receipt extraction schema (PRD §6.3). The same shape is sent to OpenRouter as
 * a strict `json_schema` response_format AND used to validate the model's output
 * with zod afterwards (defense in depth, §6.4).
 */
import { z } from 'zod';

export const receiptItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number().nullable().optional(),
  totalPrice: z.number(),
  taxRate: z.number().nullable().optional(),
});

export const receiptSchema = z.object({
  merchant: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  currency: z.string(),
  items: z.array(receiptItemSchema),
  subtotal: z.number().nullable().optional(),
  tax: z.number().nullable().optional(),
  tip: z.number().nullable().optional(),
  total: z.number(),
  confidence: z.number(),
});

export type RawReceipt = z.infer<typeof receiptSchema>;

/** The strict JSON schema sent to OpenRouter's `response_format`. */
export const RECEIPT_JSON_SCHEMA = {
  name: 'receipt',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['currency', 'items', 'total', 'confidence'],
    properties: {
      merchant: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'ISO 8601 if present' },
      currency: { type: 'string', description: 'ISO 4217, e.g. CZK' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'quantity', 'totalPrice'],
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number' },
            unitPrice: { type: ['number', 'null'] },
            totalPrice: { type: 'number' },
            taxRate: { type: ['number', 'null'] },
          },
        },
      },
      subtotal: { type: ['number', 'null'] },
      tax: { type: ['number', 'null'] },
      tip: { type: ['number', 'null'] },
      total: { type: 'number' },
      confidence: { type: 'number', description: '0..1' },
    },
  },
} as const;
