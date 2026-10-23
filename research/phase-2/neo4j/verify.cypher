// verify.cypher — smoke tests for Phase 2 KG deployment.
//
// HOW TO RUN:
//   docker exec -i bee-neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD < verify.cypher
//
// Each query has expected result documented inline. Diff against actual.

// ============================================================
// 1. Schema sanity
// ============================================================

// Should return >= 13 constraints (one per node type)
SHOW CONSTRAINTS;

// Should return >= 15 indexes
SHOW INDEXES;

// ============================================================
// 2. Roster seed sanity
// ============================================================

// All 6 employees + 9 contractors + 1 inspector = 16 :Person nodes after roster seed
MATCH (p:Person)
RETURN p.category AS category, count(*) AS n
ORDER BY n DESC;
// Expected:
//  contractors      9
//  employees        6
//  external_inspectors 1
//  (or similar — depends on populated roster)

// Self node exists
MATCH (p:Person:Self) RETURN p.id, p.name_he, p.phone;
// Expected: barak / ברק ברזל / +972509554483

// ============================================================
// 3. Key customer sanity
// ============================================================

MATCH (c:Customer) RETURN c.name_he, c.sites_count, c.total_capacity_mw
ORDER BY c.total_capacity_mw DESC LIMIT 5;
// Expected (top 5 from MEMORY.md):
//  Rafael Solar      27   10.7
//  Palar             28    5.6
//  חכל שדרות         48    2.6
//  צרויה             11    2.5
//  האגודה למען החייל 13    1.3

// ============================================================
// 4. Suppliers
// ============================================================

MATCH (s:Supplier) RETURN s.name, s.role, s.payment_terms_days
ORDER BY s.name;
// Expected: Prime Energy + (Deye / Solar-Space / Eliran etc.) ≥ 4 rows

// ============================================================
// 5. Sync marker
// ============================================================

MATCH (sync:System {id: 'roster-sync'})
RETURN sync.last_synced_at, sync.summary;
// Expected: a recent timestamp (within last hour)

// ============================================================
// 6. Sample query — "find a contractor by skill"
// ============================================================

MATCH (p:Person)
WHERE 'electrical-install' IN p.skills OR 'solar-install' IN p.skills
RETURN p.name_he, p.skills LIMIT 10;
// Should return at least Bigsol + Vladimir + maybe others

// ============================================================
// 7. Sample query — "find a customer by name fragment" (will be used by alfred-identity)
// ============================================================

MATCH (c:Customer)
WHERE c.name_he CONTAINS 'רפאל' OR c.name_he CONTAINS 'Rafael'
RETURN c.id, c.name_he, c.sites_count;
// Expected: rafael_solar / Rafael Solar / 27

// ============================================================
// 8. Count check
// ============================================================

MATCH (n) RETURN labels(n) AS label, count(*) AS n
ORDER BY n DESC;
// After roster seed only: ~20-30 total nodes
// After BEE snapshot seed (next): hundreds of :Site, :Project, :Job
