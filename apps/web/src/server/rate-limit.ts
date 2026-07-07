import 'server-only';
import { createRateLimiter } from '@evenup/api';

// 10 receipt scans per minute per user (PRD §9.2).
export const ocrRateLimit = createRateLimiter({ max: 10, windowMs: 60_000 });
