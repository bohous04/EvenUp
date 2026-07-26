-- Settlements used to persist the English literal 'Settlement' as their title,
-- which leaked untranslated into the Czech UI. An empty title now means "no
-- note of its own" and the label is resolved at render time.
-- Scoped to TRANSFER so an expense a user genuinely named "Settlement" survives.
UPDATE "Transaction" SET title = '' WHERE type = 'TRANSFER' AND title = 'Settlement';

-- The activity feed freezes the title into ActivityLog.payload at write time
-- (transaction.updated / transaction.deleted), so any settlement edited or
-- deleted before the fix above still has {"title":"Settlement"} baked into its
-- payload and would keep showing the English word in the Czech feed forever.
-- Scoped to those two actions specifically -- unlike the row above, the
-- payload alone can't say whether a row came from an expense or a transfer,
-- and `expense.created` (transaction.ts, recurring-service.ts) has no empty-
-- title fallback in activity-message.ts: blanking it there would render as
-- "{actor} vytvořil(a) " with a visible hole where the title used to be. Only
-- transaction.updated/deleted resolve an empty title back to "Vyrovnání" /
-- "Settlement", so those are the only actions this may touch.
-- payload is jsonb; ->> reads the "title" key as text, and the NULL check
-- guards rows with no payload at all (the column is nullable).
UPDATE "ActivityLog"
SET payload = jsonb_set(payload, '{title}', '""'::jsonb)
WHERE action IN ('transaction.updated', 'transaction.deleted')
  AND payload IS NOT NULL
  AND payload->>'title' = 'Settlement';
