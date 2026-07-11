// schema.cypher — initial KG schema for BEE
//
// Phase 2 Action #7 — apply to fresh Neo4j Community deploy.
//
// HOW TO APPLY:
//   docker exec -i bee-neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD < schema.cypher
//
// VERIFY: see verify.cypher

// ============================================================
// CONSTRAINTS — uniqueness enforced at DB level
// ============================================================

// People (employees + contractors + inspectors + suppliers)
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT person_phone IF NOT EXISTS FOR (p:Person) REQUIRE p.phone IS UNIQUE;

// Customers (special Person subtype + organizational entity)
CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE;

// Sites (physical locations)
CREATE CONSTRAINT site_id IF NOT EXISTS FOR (s:Site) REQUIRE s.id IS UNIQUE;

// Projects (commercial engagements per Q73)
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (pr:Project) REQUIRE pr.id IS UNIQUE;

// Jobs (units of work within projects)
CREATE CONSTRAINT job_id IF NOT EXISTS FOR (j:Job) REQUIRE j.id IS UNIQUE;

// Equipment (per-installation hardware)
CREATE CONSTRAINT equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT equipment_serial IF NOT EXISTS FOR (e:Equipment) REQUIRE e.serial IS UNIQUE;

// Tenders (Phase 1 + v16 13.B)
CREATE CONSTRAINT tender_id IF NOT EXISTS FOR (t:Tender) REQUIRE t.id IS UNIQUE;

// Quotes (proposal-generator output, v11 8.E)
CREATE CONSTRAINT quote_id IF NOT EXISTS FOR (q:Quote) REQUIRE q.id IS UNIQUE;

// Invoices (Invoice Maven sync)
CREATE CONSTRAINT invoice_id IF NOT EXISTS FOR (i:Invoice) REQUIRE i.id IS UNIQUE;
CREATE CONSTRAINT invoice_allocation IF NOT EXISTS FOR (i:Invoice) REQUIRE i.allocation_number IS UNIQUE;

// Calls (v5 voice pipeline)
CREATE CONSTRAINT call_id IF NOT EXISTS FOR (c:Call) REQUIRE c.id IS UNIQUE;

// Messages (WA / Email captures)
CREATE CONSTRAINT message_id IF NOT EXISTS FOR (m:Message) REQUIRE m.id IS UNIQUE;

// Leads (Monday Leads board sync)
CREATE CONSTRAINT lead_id IF NOT EXISTS FOR (l:Lead) REQUIRE l.id IS UNIQUE;

// Suppliers
CREATE CONSTRAINT supplier_id IF NOT EXISTS FOR (sup:Supplier) REQUIRE sup.id IS UNIQUE;

// ============================================================
// INDEXES — speed up common queries
// ============================================================

CREATE INDEX person_name_he IF NOT EXISTS FOR (p:Person) ON (p.name_he);
CREATE INDEX person_role IF NOT EXISTS FOR (p:Person) ON (p.role);

CREATE INDEX customer_name IF NOT EXISTS FOR (c:Customer) ON (c.name_he);
CREATE INDEX customer_tier IF NOT EXISTS FOR (c:Customer) ON (c.sla_tier);

CREATE INDEX site_name IF NOT EXISTS FOR (s:Site) ON (s.name);
CREATE INDEX site_city IF NOT EXISTS FOR (s:Site) ON (s.city);
CREATE INDEX site_wa_group IF NOT EXISTS FOR (s:Site) ON (s.wa_group_id);

CREATE INDEX project_status IF NOT EXISTS FOR (pr:Project) ON (pr.status);
CREATE INDEX job_status IF NOT EXISTS FOR (j:Job) ON (j.status);
CREATE INDEX job_assigned IF NOT EXISTS FOR (j:Job) ON (j.assigned_to);

CREATE INDEX equipment_type IF NOT EXISTS FOR (e:Equipment) ON (e.type);
CREATE INDEX equipment_brand IF NOT EXISTS FOR (e:Equipment) ON (e.brand);

CREATE INDEX tender_deadline IF NOT EXISTS FOR (t:Tender) ON (t.deadline_date);
CREATE INDEX tender_status IF NOT EXISTS FOR (t:Tender) ON (t.status);

CREATE INDEX message_created IF NOT EXISTS FOR (m:Message) ON (m.created_at);
CREATE INDEX call_created IF NOT EXISTS FOR (c:Call) ON (c.created_at);
CREATE INDEX invoice_date IF NOT EXISTS FOR (i:Invoice) ON (i.date);

// ============================================================
// SAMPLE NODES (will be replaced by seed scripts)
// ============================================================

// Just one verification node — confirms schema works
MERGE (root:System {id: 'bee-kg-root'})
  SET root.deployed_at = datetime(),
      root.version = '0.1.0',
      root.notes = 'BEE KG initialized. Run seed-from-roster.py + seed-from-bee-snapshot.py next.';

RETURN root.id AS node_id, root.deployed_at AS deployed_at;
