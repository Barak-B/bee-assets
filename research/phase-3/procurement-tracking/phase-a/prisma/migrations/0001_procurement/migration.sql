-- Phase A migration — procurement-tracking ingestion (per LLD.md §3.2)
-- Self-contained: includes Wave 53/A tables (BankAccount/BankTransaction/IngestRun/
-- IngestionLock) so this directory can be migrated and tested independently.
-- When porting into BEE app, apply ONLY the Wave 53/B block below the divider —
-- 53/A is already there.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- === Wave 53/A tables (copied for standalone migration) ===
-- ============================================================

CREATE TABLE "BankAccount" (
    "id"            TEXT PRIMARY KEY,
    "iban"          TEXT NOT NULL UNIQUE,
    "bankCode"      TEXT NOT NULL,  -- 17=Mercantile 11=Discount 12=Hapoalim 10=Leumi 20=Mizrahi
    "accountNumber" TEXT NOT NULL,
    "alias"         TEXT,
    "currency"      TEXT NOT NULL DEFAULT 'ILS',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cursorTs"      TIMESTAMP(3),
    "cursorTxId"    TEXT
);

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

CREATE TABLE "IngestRun" (
    "id"                TEXT PRIMARY KEY,
    "pipeline"          TEXT NOT NULL,
    "sourceMode"        TEXT NOT NULL,
    "accountId"         TEXT,
    "startedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"        TIMESTAMP(3),
    "status"            TEXT NOT NULL,
    "rowsRead"          INTEGER NOT NULL DEFAULT 0,
    "rowsInserted"      INTEGER NOT NULL DEFAULT 0,
    "rowsDedupedHard"   INTEGER NOT NULL DEFAULT 0,
    "rowsDedupedFuzzy"  INTEGER NOT NULL DEFAULT 0,
    "errorCode"         TEXT,
    "errorMessage"      TEXT
);
CREATE INDEX "IngestRun_pipeline_startedAt_idx"
    ON "IngestRun"("pipeline", "startedAt" DESC);

CREATE TABLE "IngestionLock" (
    "key"         TEXT PRIMARY KEY,
    "holderPid"   TEXT NOT NULL,
    "acquiredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "IngestionLock_expiresAt_idx" ON "IngestionLock"("expiresAt");

-- =================================================================
-- === Wave 53/B procurement tables (the diff this Phase ships) ===
-- =================================================================

-- Supplier — one row per known counterparty. nameNorm is unique post §3.4 cleanup
CREATE TABLE "Supplier" (
    "id"                TEXT PRIMARY KEY,
    "nameRaw"           TEXT NOT NULL,
    "nameNorm"          TEXT NOT NULL UNIQUE,
    "taxId"             TEXT,
    "contactEmail"      TEXT,
    "contactPhone"      TEXT,
    "waGroupJid"        TEXT,
    "paymentTermsDays"  INTEGER NOT NULL DEFAULT 30,
    "avgLeadTimeDays"   DOUBLE PRECISION,
    "category"          TEXT,
    "status"            TEXT NOT NULL DEFAULT 'watchlist',  -- watchlist | active | inactive
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Supplier_category_idx" ON "Supplier"("category");
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");
-- Trigram index for fuzzy supplier matching (LLD §3.4 / §3.5)
CREATE INDEX "Supplier_nameNorm_trgm_idx"
    ON "Supplier" USING gin ("nameNorm" gin_trgm_ops);

CREATE TABLE "PurchaseOrder" (
    "id"            TEXT PRIMARY KEY,
    "poNumber"      TEXT,
    "supplierId"    TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
    "source"        TEXT NOT NULL,
    "sourceRefId"   TEXT NOT NULL,
    "orderedAt"     TIMESTAMP(3) NOT NULL,
    "expectedAt"    TIMESTAMP(3),
    "receivedAt"    TIMESTAMP(3),
    "totalCents"    BIGINT NOT NULL,
    "currency"      TEXT NOT NULL DEFAULT 'ILS',
    "status"        TEXT NOT NULL,  -- open | partial | received | paid | cancelled
    "jobId"         TEXT,
    "rawText"       TEXT NOT NULL,
    "ingestRunId"   TEXT NOT NULL,
    "ingestedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated"     BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "PurchaseOrder_source_sourceRefId_key"
    ON "PurchaseOrder"("source", "sourceRefId");
CREATE INDEX "PurchaseOrder_supplierId_orderedAt_idx"
    ON "PurchaseOrder"("supplierId", "orderedAt" DESC);
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrder_expectedAt_idx" ON "PurchaseOrder"("expectedAt");

CREATE TABLE "PurchaseOrderLine" (
    "id"                TEXT PRIMARY KEY,
    "poId"              TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE,
    "sku"               TEXT,
    "description"       TEXT NOT NULL,
    "descriptionNorm"   TEXT NOT NULL,
    "qty"               DECIMAL(10,3) NOT NULL,
    "unit"              TEXT NOT NULL,
    "unitPriceCents"    BIGINT NOT NULL,
    "lineTotalCents"    BIGINT NOT NULL
);
CREATE INDEX "PurchaseOrderLine_descriptionNorm_idx"
    ON "PurchaseOrderLine"("descriptionNorm");
-- Trigram on description so benchmark lookups can do fuzzy join across slight phrasing changes
CREATE INDEX "PurchaseOrderLine_descriptionNorm_trgm_idx"
    ON "PurchaseOrderLine" USING gin ("descriptionNorm" gin_trgm_ops);

CREATE TABLE "SupplierInvoice" (
    "id"                     TEXT PRIMARY KEY,
    "supplierId"             TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
    "invoiceNumber"          TEXT NOT NULL,
    "shaamAllocationNumber"  TEXT,
    "issuedAt"               TIMESTAMP(3) NOT NULL,
    "dueAt"                  TIMESTAMP(3) NOT NULL,
    "totalCents"             BIGINT NOT NULL,
    "currency"               TEXT NOT NULL DEFAULT 'ILS',
    "status"                 TEXT NOT NULL,
    "poIds"                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "bankTxId"               TEXT REFERENCES "BankTransaction"("id") ON DELETE SET NULL,
    "source"                 TEXT NOT NULL,
    "sourceRefId"            TEXT NOT NULL,
    "rawText"                TEXT NOT NULL,
    "ingestRunId"            TEXT NOT NULL,
    "ingestedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated"              BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "SupplierInvoice_source_sourceRefId_key"
    ON "SupplierInvoice"("source", "sourceRefId");
CREATE UNIQUE INDEX "SupplierInvoice_supplierId_invoiceNumber_key"
    ON "SupplierInvoice"("supplierId", "invoiceNumber");
CREATE INDEX "SupplierInvoice_status_dueAt_idx"
    ON "SupplierInvoice"("status", "dueAt");

CREATE TABLE "PriceBenchmark" (
    "id"                 TEXT PRIMARY KEY,
    "descriptionNorm"    TEXT NOT NULL,
    "category"           TEXT NOT NULL,
    "unit"               TEXT NOT NULL,
    "windowStart"        TIMESTAMP(3) NOT NULL,
    "windowEnd"          TIMESTAMP(3) NOT NULL,
    "count"              INTEGER NOT NULL,
    "avgUnitPriceCents"  BIGINT NOT NULL,
    "stdDevCents"        BIGINT NOT NULL
);
CREATE UNIQUE INDEX "PriceBenchmark_descriptionNorm_windowStart_key"
    ON "PriceBenchmark"("descriptionNorm", "windowStart");
CREATE INDEX "PriceBenchmark_category_idx" ON "PriceBenchmark"("category");

CREATE TABLE "LeadTimeRecord" (
    "id"           TEXT PRIMARY KEY,
    "supplierId"   TEXT NOT NULL,
    "poId"         TEXT NOT NULL UNIQUE REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE,
    "orderedAt"    TIMESTAMP(3) NOT NULL,
    "receivedAt"   TIMESTAMP(3) NOT NULL,
    "leadDays"     DOUBLE PRECISION NOT NULL
);
CREATE INDEX "LeadTimeRecord_supplierId_orderedAt_idx"
    ON "LeadTimeRecord"("supplierId", "orderedAt" DESC);
