#!/usr/bin/env python3
"""
seed-from-roster.py — Phase 2 Action #7
Populates Neo4j KG with :Person, :Customer, :Supplier nodes from roster.yaml.

USAGE:
    pip install neo4j pyyaml
    NEO4J_PASSWORD=... python3 seed-from-roster.py \
        --roster /path/to/roster.yaml \
        --neo4j-uri bolt://localhost:7687

OUTPUT:
    - :Person nodes for employees + contractors + external_inspectors
    - :Customer nodes for key_customers
    - :Supplier nodes for suppliers
    - :System node marking last_roster_sync

IDEMPOTENT: re-running merges (no duplicates).
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import yaml
    from neo4j import GraphDatabase, basic_auth
except ImportError as e:
    print(f"Missing dependency: {e}\nRun: pip install neo4j pyyaml")
    sys.exit(1)


def parse_args():
    p = argparse.ArgumentParser(description="Seed Neo4j from roster.yaml")
    p.add_argument(
        "--roster",
        default=str(Path.home() / ".openclaw" / "workspace" / "roster.yaml"),
        help="Path to roster.yaml",
    )
    p.add_argument("--neo4j-uri", default="bolt://localhost:7687")
    p.add_argument("--neo4j-user", default="neo4j")
    p.add_argument("--dry-run", action="store_true", help="Print actions, don't write")
    return p.parse_args()


def load_roster(path):
    if not Path(path).exists():
        sys.exit(f"roster.yaml not found at {path}")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def seed_self(tx, self_data):
    if not self_data:
        return 0
    result = tx.run(
        """
        MERGE (p:Person {id: $id})
        SET p.name_he = $name_he,
            p.name_en = $name_en,
            p.role = 'principal',
            p.phone = $phone,
            p.email = $email,
            p:Self,
            p.updated_at = datetime()
        RETURN p.id
        """,
        id=self_data.get("id"),
        name_he=self_data.get("name_he"),
        name_en=self_data.get("name_en"),
        phone=self_data.get("phone"),
        email=self_data.get("email"),
    )
    return 1 if result.single() else 0


def seed_persons(tx, category_key, persons, dry_run=False):
    """Generic :Person seeder. category_key = 'employees' | 'contractors' | etc."""
    count = 0
    if not persons:
        return 0

    role_map = {
        "employees": "employee",
        "contractors": "contractor",
        "external_inspectors": "inspector",
    }
    role = role_map.get(category_key, category_key)

    for p in persons:
        pid = p.get("id")
        if not pid:
            continue
        if dry_run:
            print(f"  [DRY] :Person {pid} ({p.get('name_he')}) role={role}")
            count += 1
            continue

        # Skill list — store as array
        skills = p.get("skills") or []
        phone = p.get("phone") or None
        # Avoid NULL phone clashing with uniqueness constraint
        phone_for_merge = phone if phone else f"_noPhone_{pid}"

        tx.run(
            """
            MERGE (p:Person {id: $id})
            SET p.name_he = $name_he,
                p.name_en = $name_en,
                p.role = $role,
                p.category = $category,
                p.phone = $phone,
                p.email = $email,
                p.skills = $skills,
                p.company = $company,
                p.updated_at = datetime()
            """,
            id=pid,
            name_he=p.get("name_he"),
            name_en=p.get("name_en"),
            role=role,
            category=category_key,
            phone=phone_for_merge,
            email=p.get("email"),
            skills=skills,
            company=p.get("company"),
        )
        count += 1
    return count


def seed_customers(tx, customers, dry_run=False):
    count = 0
    if not customers:
        return 0
    for c in customers:
        cid = c.get("id")
        if not cid:
            continue
        if dry_run:
            print(f"  [DRY] :Customer {cid} ({c.get('name_he')}) {c.get('total_capacity_mw')}MW")
            count += 1
            continue
        tx.run(
            """
            MERGE (c:Customer {id: $id})
            SET c.name_he = $name_he,
                c.type = $type,
                c.sites_count = $sites_count,
                c.total_capacity_mw = $total_capacity_mw,
                c.portal_access = $portal_access,
                c.sla_tier = $sla_tier,
                c.primary_contact = $primary_contact,
                c.updated_at = datetime()
            """,
            id=cid,
            name_he=c.get("name_he"),
            type=c.get("type"),
            sites_count=c.get("sites_count"),
            total_capacity_mw=c.get("total_capacity_mw"),
            portal_access=c.get("portal_access", False),
            sla_tier=c.get("sla_tier"),
            primary_contact=c.get("primary_contact"),
        )
        count += 1
    return count


def seed_suppliers(tx, suppliers, dry_run=False):
    count = 0
    if not suppliers:
        return 0
    for s in suppliers:
        sid = s.get("id")
        if not sid:
            continue
        if dry_run:
            print(f"  [DRY] :Supplier {sid} ({s.get('name')})")
            count += 1
            continue
        tx.run(
            """
            MERGE (sup:Supplier {id: $id})
            SET sup.name = $name,
                sup.role = $role,
                sup.contact = $contact,
                sup.payment_terms_days = $payment_terms_days,
                sup.typical_items = $typical_items,
                sup.updated_at = datetime()
            """,
            id=sid,
            name=s.get("name"),
            role=s.get("role"),
            contact=s.get("contact"),
            payment_terms_days=s.get("payment_terms_days"),
            typical_items=s.get("typical_items") or [],
        )
        count += 1
    return count


def mark_sync(tx, summary):
    tx.run(
        """
        MERGE (sync:System {id: 'roster-sync'})
        SET sync.last_synced_at = datetime(),
            sync.summary = $summary
        """,
        summary=str(summary),
    )


def main():
    args = parse_args()
    password = os.environ.get("NEO4J_PASSWORD")
    if not password and not args.dry_run:
        sys.exit("Set NEO4J_PASSWORD env var (or use --dry-run)")

    roster = load_roster(args.roster)
    print(f"Loaded roster v{roster.get('version', '?')} from {args.roster}")

    if args.dry_run:
        print("\n[DRY RUN MODE] No DB writes.\n")
        # Just print what would happen
        seed_persons(None, "employees", roster.get("employees"), dry_run=True)
        seed_persons(None, "contractors", roster.get("contractors"), dry_run=True)
        seed_persons(None, "external_inspectors", roster.get("external_inspectors"), dry_run=True)
        seed_customers(None, roster.get("key_customers"), dry_run=True)
        seed_suppliers(None, roster.get("suppliers"), dry_run=True)
        return

    driver = GraphDatabase.driver(args.neo4j_uri, auth=basic_auth(args.neo4j_user, password))

    summary = {}
    try:
        with driver.session() as session:
            summary["self"] = session.execute_write(seed_self, roster.get("self"))
            summary["employees"] = session.execute_write(
                seed_persons, "employees", roster.get("employees") or []
            )
            summary["contractors"] = session.execute_write(
                seed_persons, "contractors", roster.get("contractors") or []
            )
            summary["inspectors"] = session.execute_write(
                seed_persons, "external_inspectors", roster.get("external_inspectors") or []
            )
            summary["customers"] = session.execute_write(
                seed_customers, roster.get("key_customers") or []
            )
            summary["suppliers"] = session.execute_write(
                seed_suppliers, roster.get("suppliers") or []
            )
            session.execute_write(mark_sync, summary)

        print("\nSeed complete:")
        for k, v in summary.items():
            print(f"  :{k:<15} {v} nodes")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
