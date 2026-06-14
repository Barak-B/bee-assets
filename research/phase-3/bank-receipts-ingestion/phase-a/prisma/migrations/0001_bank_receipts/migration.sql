-- Phase A migration — bank-receipts ingestion (per LLD.md §3.2)
-- Apply via: npx prisma migrate deploy
-- pg_trgm is REQUIRED for fuzzy dedup (LLD §3.4)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- BankAccount — one row per bank account we ingest from
-- ============================================================
CREATE TABLE "BankAccount" (
    "id"            TEXT PRIMARY KEY,
    "iban"          TEXT NOT NULL UNIQUE,
    "bankCode"      TEXT NOT NULL,  -- 12=Hapoalim 10=Leumi 11=Discount 20=Mizrahi
    "accountNumber" TEXT NOT NULL,
    "alias"         TEXT,
    "currency"      TEXT NOT NULL DEFAULT 'ILS',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cursorTs"      TIMESTAMP(3),
    "cursorTxId"    TEXT
);

-- ============================================================
-- BankTransaction — one row per ingested transaction
-- Hard dedup: (accountId, externalTxId) unique (LLD §3.4)
-- Cursor index: (accountId, valueDate, externalTxId) (LLD §3.1)
-- ============================================================
CREATE TABLE "BankTransaction" (
    "id"                TEXT PRIMARY KEY,
    "accountId"         TEXT NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,

    "externalTxId"      TEXT NOT NULL,
    "valueDate"         TIMESTAMP(3) NOT NULL,
    "bookingDate"       TIMESTAMP(3),
    "amountCents"       BIGINT NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'ILS',
    "counterpartyRaw"   TEXT NOT NULL,
    "counterpartyNorm"  TEXT NOT NULL,
    "memo"              TEXT,

    "customerId"        TEXT,
    "invoiceMavenId"    TEXT,
    "category"          TEXT,
    "anomalyScore"      DOUBLE PRECISION,

    "sourceMode"        TEXT NOT NULL,
    "ingestedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestRunId"       TEXT NOT NULL,
    "validated"         BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX "BankTransaction_accountId_externalTxId_key"
    ON "BankTransaction"("accountId", "externalTxId");
CREATE INDEX "BankTransaction_accountId_valueDate_externalTxId_idx"
    ON "BankTransaction"("accountId", "valueDate", "externalTxId");
CREATE INDEX "BankTransaction_counterpartyNorm_trgm_idx"
    ON "BankTransaction" USING gin ("counterpartyNorm" gin_trgm_ops);
CREATE INDEX "BankTransaction_customerId_idx"
    ON "BankTransaction"("customerId");

-- ============================================================
-- IngestRun — group transactions per run for rollback + observability
-- ============================================================
CREATE TABLE "IngestRun" (
    "id"                TEXT PRIMARY KEY,
    "pipeline"          TEXT NOT NULL,
    "sourceMode"        TEXT NOT NULL,
    "accountId"         TEXT,
    "startedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"        TIMESTAMP(3),
    "status"            TEXT NOT NULL,  -- running | ok | fail | partial
    "rowsRead"          INTEGER NOT NULL DEFAULT 0,
    "rowsInserted"      INTEGER NOT NULL DEFAULT 0,
    "rowsDedupedHard"   INTEGER NOT NULL DEFAULT 0,
    "rowsDedupedFuzzy"  INTEGER NOT NULL DEFAULT 0,
    "errorCode"         TEXT,
    "errorMessage"      TEXT
);
CREATE INDEX "IngestRun_pipeline_startedAt_idx"
    ON "IngestRun"("pipeline", "startedAt" DESC);

-- ============================================================
-- IngestionLock — generic distributed lock (PROTOCOL §3.2)
-- Fallback when Redis is not available. TTL via expiresAt — workers must
-- skip rows where expiresAt > now() and self-clean on acquire.
-- ============================================================
CREATE TABLE "IngestionLock" (
    "key"         TEXT PRIMARY KEY,
    "holderPid"   TEXT NOT NULL,
    "acquiredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "IngestionLock_expiresAt_idx" ON "IngestionLock"("expiresAt");
