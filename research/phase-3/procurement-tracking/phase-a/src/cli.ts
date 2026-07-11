// Phase A CLI — entry for ingest + dry-run + smoke test
//
// Usage:
//   node --experimental-strip-types src/cli.ts selftest
//   node --experimental-strip-types src/cli.ts ingest --source <watchDir> [--name <label>] [--dry-run]
//   node --experimental-strip-types src/cli.ts normalize "אלקטרו-טק בע\"מ"
//   node --experimental-strip-types src/cli.ts parse <csv-file>
//
// Returns JSON. Non-zero exit on failure (PROTOCOL §4.3).
// Prisma is lazy-loaded so `selftest` + `parse` work without `npm install`.

import { cleanSupplierName, cleanDescription, parseAmountCents, parseIsraeliDate } from "./normalize.js";
import { tryParseManualCsv } from "./extract.js";
import { readFile } from "node:fs/promises";

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === "selftest") {
    selftest();
    return;
  }
  if (cmd === "normalize") {
    console.log(JSON.stringify({ normalized: cleanSupplierName(argv[1] ?? "") }));
    return;
  }
  if (cmd === "parse") {
    const file = argv[1];
    if (!file) {
      process.stderr.write("Usage: cli parse <csv-file>\n");
      process.exit(2);
    }
    const text = await readFile(file, "utf-8");
    const result = tryParseManualCsv(text);
    console.log(JSON.stringify({
      poCount: result.pos.length,
      pos: result.pos.map((p) => ({
        poNumber: p.poNumber,
        orderedAt: p.orderedAt.toISOString(),
        expectedAt: p.expectedAt?.toISOString(),
        currency: p.currency,
        totalCents: p.totalCents.toString(),
        lineCount: p.lines.length,
      })),
      errors: result.errors,
    }, null, 2));
    return;
  }
  if (cmd === "ingest") {
    const watchDir = argFlag(argv, "--source");
    const sourceName = argFlag(argv, "--name") ?? `manual:${watchDir ?? "."}`;
    const dryRun = argv.includes("--dry-run");
    if (!watchDir) {
      process.stderr.write("Usage: cli ingest --source <watchDir> [--name <label>] [--dry-run]\n");
      process.exit(2);
    }
    // Lazy-load — keeps selftest/parse independent of `npm install`
    const { PrismaClient } = await import("@prisma/client");
    const { ManualUploadSource } = await import("./sources/manual.js");
    const { ingestProcurement } = await import("./ingest.js");
    const prisma = new PrismaClient();
    const src = new ManualUploadSource({ watchDir });
    try {
      const out = await ingestProcurement(prisma, { sourceName, source: src, dryRun });
      console.log(JSON.stringify(out, replacer, 2));
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  process.stderr.write("commands: selftest | normalize | parse | ingest\n");
  process.exit(2);
}

function argFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** JSON.stringify replacer that handles BigInt (PO totalCents). */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function selftest() {
  const tests: { name: string; fn: () => void }[] = [
    {
      name: "cleanSupplierName: corporate suffix + Hebrew prefixes",
      fn: () => {
        const cases: [string, string][] = [
          ["אלקטרו-טק בע\"מ",        "אלקטרו-טק"],
          ["של חברת אורות בע'מ",     "חברת אורות"],
          ["Prime Energy Ltd.",      "prime energy"],
          ["KStar IL (2007)",        "kstar il"],
          ["ABB SACE",               "abb sace"],
        ];
        for (const [input, expected] of cases) {
          const got = cleanSupplierName(input);
          if (got !== expected) throw new Error(`"${input}" -> "${got}" (expected "${expected}")`);
        }
      },
    },
    {
      name: "cleanDescription: collapse + normalize mm²",
      fn: () => {
        const cases: [string, string][] = [
          ["Cable 6 mm² black",      "cable 6mm2 black"],
          ["- Inverter 8kW (DEYE)",  "inverter 8kw"],
          ["Panel 450W  ",           "panel 450w"],
        ];
        for (const [input, expected] of cases) {
          const got = cleanDescription(input);
          if (got !== expected) throw new Error(`"${input}" -> "${got}" (expected "${expected}")`);
        }
      },
    },
    {
      name: "parseAmountCents: signed / thousands / suffix-minus",
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
      name: "parseIsraeliDate: DD/MM/YYYY → Asia/Jerusalem midnight",
      fn: () => {
        const d = parseIsraeliDate("13/06/2026");
        const iso = d.toISOString();
        if (!iso.startsWith("2026-06-12T21:00")) throw new Error(`got ${iso}`);
      },
    },
    {
      name: "tryParseManualCsv: 3-row PO with header → 1 ExtractedPO + 3 lines",
      fn: () => {
        const csv = `po_number,supplier,description,sku,qty,unit,unit_price,ordered_at,expected_at,currency
PO-2026-001,Prime Energy,Panel 550W Mono,PE-550,12,pcs,650.00,15/06/2026,22/06/2026,ILS
PO-2026-001,Prime Energy,Inverter 10kW,PE-INV10,1,pcs,3850.00,15/06/2026,22/06/2026,ILS
PO-2026-001,Prime Energy,Cable 6mm²,PE-C6,150,m,4.20,15/06/2026,22/06/2026,ILS`;
        const r = tryParseManualCsv(csv);
        if (r.errors.length !== 0) throw new Error(`unexpected errors: ${JSON.stringify(r.errors)}`);
        if (r.pos.length !== 1) throw new Error(`expected 1 PO, got ${r.pos.length}`);
        const po = r.pos[0];
        if (po.lines.length !== 3) throw new Error(`expected 3 lines, got ${po.lines.length}`);
        // 12 * 65000 + 1 * 385000 + 150 * 420 = 780000 + 385000 + 63000 = 1228000 cents
        if (po.totalCents !== 1228000n) throw new Error(`totalCents=${po.totalCents} (expected 1228000)`);
        if (po.poNumber !== "PO-2026-001") throw new Error(`poNumber=${po.poNumber}`);
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
