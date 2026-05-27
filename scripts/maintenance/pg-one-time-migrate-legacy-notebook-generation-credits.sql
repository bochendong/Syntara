-- One-time cleanup for legacy notebook-generation credit data.
-- Safe to run multiple times (idempotent).
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/pg-one-time-migrate-legacy-notebook-generation-credits.sql

BEGIN;

DO $$
DECLARE
  has_legacy_balance_column boolean := false;
  migrated_user_rows integer := 0;
  migrated_account_rows integer := 0;
  migrated_kind_rows integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'notebookGenerationBalance'
  ) INTO has_legacy_balance_column;

  -- Older schema had User.notebookGenerationBalance; merge to compute credits if still present.
  IF has_legacy_balance_column THEN
    EXECUTE '
      UPDATE "User"
      SET "computeCreditsBalance" = "computeCreditsBalance" + COALESCE("notebookGenerationBalance", 0)
      WHERE COALESCE("notebookGenerationBalance", 0) <> 0
    ';
    GET DIAGNOSTICS migrated_user_rows = ROW_COUNT;

    EXECUTE '
      UPDATE "User"
      SET "notebookGenerationBalance" = 0
      WHERE "notebookGenerationBalance" IS NOT NULL
    ';
  END IF;

  -- Migrate legacy account type rows.
  UPDATE "CreditTransaction"
  SET "accountType" = 'COMPUTE'::"CreditAccountType"
  WHERE "accountType"::text = 'NOTEBOOK_GENERATION';
  GET DIAGNOSTICS migrated_account_rows = ROW_COUNT;

  -- Migrate legacy transaction kind rows.
  UPDATE "CreditTransaction"
  SET "kind" = 'TOKEN_USAGE'::"CreditTransactionKind"
  WHERE "kind"::text = 'NOTEBOOK_GENERATION_USAGE';
  GET DIAGNOSTICS migrated_kind_rows = ROW_COUNT;

  RAISE NOTICE 'Legacy migration done. user_rows=%, account_rows=%, kind_rows=%',
    migrated_user_rows, migrated_account_rows, migrated_kind_rows;
END $$;

-- Post-checks: both counts should be 0.
SELECT
  COUNT(*) AS legacy_account_type_rows
FROM "CreditTransaction"
WHERE "accountType"::text = 'NOTEBOOK_GENERATION';

SELECT
  COUNT(*) AS legacy_kind_rows
FROM "CreditTransaction"
WHERE "kind"::text = 'NOTEBOOK_GENERATION_USAGE';

COMMIT;
