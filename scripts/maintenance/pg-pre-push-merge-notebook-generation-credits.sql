-- Run ONCE against production Postgres *before* `prisma db push --accept-data-loss`
-- when removing NOTEBOOK_GENERATION / NOTEBOOK_GENERATION_USAGE / notebookGenerationBalance.
--
-- 1) Merge notebook-generation balance into 算力积分 (compute).
UPDATE "User"
SET
  "computeCreditsBalance" = "computeCreditsBalance" + COALESCE("notebookGenerationBalance", 0)
WHERE "notebookGenerationBalance" IS NOT NULL;

-- 2) Repoint ledger rows so enums can be shrunk without failing.
UPDATE "CreditTransaction"
SET "accountType" = 'COMPUTE'::"CreditAccountType"
WHERE "accountType" = 'NOTEBOOK_GENERATION'::"CreditAccountType";

UPDATE "CreditTransaction"
SET "kind" = 'TOKEN_USAGE'::"CreditTransactionKind"
WHERE "kind" = 'NOTEBOOK_GENERATION_USAGE'::"CreditTransactionKind";
