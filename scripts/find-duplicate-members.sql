-- Read-only: find groups where a joined account looks like a duplicate of an
-- unclaimed placeholder that still holds the debts.
--
-- Mirrors member.duplicateCandidates' high-confidence case: the LEADING token
-- must match. A shared trailing token is only a surname (Novák/Svoboda/Dvořák)
-- and is deliberately NOT enough — that was the false positive we fixed.
--
-- The duplicate's name comes from invite.claim:
--   ctx.user.name?.trim() || ctx.user.email.split('@')[0] || 'Guest'
-- so the placeholder is compared against the member name, the account name,
-- and the email local-part.
--
-- SELECT only. No writes.

WITH norm AS (
  SELECT
    m.id,
    m."groupId",
    m."displayName",
    m."userId",
    u.name  AS user_name,
    u.email AS user_email,
    -- lowercase -> strip Czech diacritics -> punctuation to space -> collapse
    regexp_replace(
      btrim(
        regexp_replace(
          translate(lower(m."displayName"), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
          '[^a-z0-9]+', ' ', 'g')),
      '\s+', ' ', 'g') AS n_member,
    regexp_replace(
      btrim(
        regexp_replace(
          translate(lower(coalesce(u.name, '')), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
          '[^a-z0-9]+', ' ', 'g')),
      '\s+', ' ', 'g') AS n_user,
    regexp_replace(
      btrim(
        regexp_replace(
          translate(lower(split_part(coalesce(u.email, ''), '@', 1)),
                    'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
          '[^a-z0-9]+', ' ', 'g')),
      '\s+', ' ', 'g') AS n_email
  FROM "Member" m
  LEFT JOIN "User" u ON u.id = m."userId"
  WHERE m."isActive" = true
),
claimed AS (
  SELECT * FROM norm WHERE "userId" IS NOT NULL
),
placeholder AS (
  SELECT * FROM norm WHERE "userId" IS NULL
),
-- Net balance per member: what they paid minus what they owe, in base units.
bal AS (
  SELECT
    mm.id AS member_id,
    COALESCE((SELECT SUM(p."amountMinorUnits")
              FROM "TransactionPayer" p WHERE p."memberId" = mm.id), 0)
    -
    COALESCE((SELECT SUM(s."computedMinorUnits")
              FROM "TransactionSplit" s WHERE s."memberId" = mm.id), 0)
      AS net_minor
  FROM "Member" mm
)
SELECT
  g.name                                   AS "group",
  g."baseCurrency"                         AS cur,
  c."displayName"                          AS joined_as,
  c.user_email                             AS account,
  p."displayName"                          AS placeholder,
  round(pb.net_minor / 100.0, 2)           AS placeholder_balance,
  (SELECT count(*) FROM "TransactionSplit" s WHERE s."memberId" = p.id)
  + (SELECT count(*) FROM "TransactionPayer" q WHERE q."memberId" = p.id)
                                           AS placeholder_rows,
  round(cb.net_minor / 100.0, 2)           AS duplicate_balance,
  g.id                                     AS group_id,
  c.id                                     AS source_member_id,
  p.id                                     AS target_member_id
FROM claimed c
JOIN placeholder p
  ON p."groupId" = c."groupId"
JOIN "Group" g ON g.id = c."groupId"
JOIN bal cb ON cb.member_id = c.id
JOIN bal pb ON pb.member_id = p.id
WHERE g."archivedAt" IS NULL
  -- Leading-token match on any of the three aliases.
  AND length(split_part(p.n_member, ' ', 1)) > 1
  AND split_part(p.n_member, ' ', 1) IN (
        split_part(c.n_member, ' ', 1),
        split_part(c.n_user,   ' ', 1),
        split_part(c.n_email,  ' ', 1)
      )
  -- A transfer directly between the pair blocks the merge; surface it as a
  -- separate column rather than hiding the row.
ORDER BY pb.net_minor ASC, g.name;
