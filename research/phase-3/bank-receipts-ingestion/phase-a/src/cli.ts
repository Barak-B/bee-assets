// Phase A CLI — entry for ingest + dry-run + smoke test
//
// Usage:
//   node --experimental-strip-types src/cli.ts ingest --account <id> [--source <csv-dir>] [--dry-run]
//   node --experimental-strip-types src/cli.ts selftest --source tests/fixture-mercantile.csv
//
// Returns JSON for parseability + non-zero exit on failure (PROTOCOL §4.3).

// NOTE: Prisma + ingest are dynamically imported below — keeps `selftest` runnable
// without `npm install`, just `node --experimental-strip-types src/cli.ts selftest`.
import { cleanCounterparty, parseAmountCents, parseIsraeliDate } from "./normalize.js";

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === "selftest") {
    selftest();
    return;
  }
  if (cmd === "normalize") {
    // Quick CLI for ad-hoc normalization checks: cli.ts normalize "אצל יעקב כהן"
    console.log(JSON.stringify({ normalized: cleanCounterparty(argv[1] ?? "") }));
    return;
  }
  if (cmd === "ingest") {
    const account = argFlag(argv, "--account");
    const sourceDir = argFlag(argv, "--source");
    const dryRun = argv.includes("--dry-run");
    if (!account || !sourceDir) {
      process.stderr.write("Usage: cli ingest --account <id> --source <csv-dir-or-file> [--dry-run]\n");
      process.exit(2);
    }
    // Lazy-load — keeps `selftest` independent of `npm install`
    const { PrismaClient } = await import("@prisma/client");
    const { CsvSource } = await import("./sources/csv.js");
    const { ingestAccount } = await import("./ingest.js");
    const prisma = new PrismaClient();
    const src = new CsvSource({
      watchDir: sourceDir,
      encoding: "utf-8",
      columnMap: { date: "value_date", amount: "amount", ref: "ref", memo: "memo" },
    });
    try {
      const out = await ingestAccount(prisma, { accountId: account, source: src, dryRun });
      console.log(JSON.stringify(out, null, 2));
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  process.stderr.write("commands: ingest | selftest | normalize\n");
  process.exit(2);
}

function argFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Self-test of pure functions — exercises normalize.ts + cursorAdvances without a DB. */
function selftest() {
  const tests: { name: string; fn: () => void }[] = [
    {
      name: "cleanCounterparty: Hebrew prefixes stripped",
      fn: () => {
        const cases: [string, string][] = [
          ["אצל יעקב כהן",        "יעקב כהן"],
          ["של חברת אורות",      "חברת אורות"],
          ["מ-בנק לאומי",         "בנק לאומי"],
          ["ה-לקוח מרפאל סולאר", "לקוח מרפאל סולאר"],
          ["BARAK ELECTRIC",     "barak electric"],
        ];
        for (const [input, expected] of cases) {
          const got = cleanCounterparty(input);
          if (got !== expected) throw new Error(`"${input}" -> "${got}" (expected "${expected}")`);
        }
      },
    },
    {
      name: "parseAmountCents: signed + thousands + suffix-minus",
      fn: () => {
        const cases: [string, bigint][] = [
          ["1,234.56",   123456n],
          ["1,234.56-",  -123456n],
          ["-500",       -50000n],
          ["0.50",       50n],
          ["10000",      1000000n],
        ];
        for (const [input, expected] of cases) {
          const got = parseAmountCents(input);
          if (got !== expected) throw new Error(`"${input}" -> ${got} (expected ${expected})`);
        }
      },
    },
    {
      name: "parseIsraeliDate: DD/MM/YYYY",
      fn: () => {
        const d = parseIsraeliDate("13/06/2026");
        const iso = d.toISOString();
        // 13.06.2026 00:00 Asia/Jerusalem = 12.06.2026 21:00 UTC (DST)
        if (!iso.startsWith("2026-06-12T21:00")) throw new Error(`got ${iso}`);
      },
    },
  ];

  let pass = 0, fail = 0;
  for (const t of tests) {
    try { t.fn(); pass++; console.log(`  PASS ${t.name}`); }
    catch (e) { fail++; console.log(`  FAIL ${t.name}\n        ${String(e)}`); }
  }
  console.log(`\nselftest: pass=${pass} fail=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${String(e)}\n`);
  process.exit(1);
});
