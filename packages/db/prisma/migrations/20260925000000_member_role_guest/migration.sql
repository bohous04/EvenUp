-- Add the view-only GUEST member role (FR-2.6 guest).
--
-- `ADD VALUE` is used deliberately rather than a table rewrite: PostgreSQL
-- cannot use a new enum value in the same transaction that adds it, so this
-- migration adds the label only. No existing row can hold it yet — existing
-- members are ADMIN or MEMBER, which keeps their behaviour identical.
ALTER TYPE "MemberRole" ADD VALUE 'GUEST';
