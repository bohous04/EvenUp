-- Track that a user has seen the first-run onboarding.
--
-- Nullable, with no default backfill: every existing row stays NULL, which
-- reads as "has not seen it". Deliberate — a one-off prompt for existing
-- accounts would be a worse experience than for genuinely new ones, so the app
-- only offers onboarding to accounts created after this migration (see the
-- `isNewAccount` check in the onboarding route).
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
