// alfred-router.patched.js — Phase 1 Action #1 (smart routing, DeepSeek-aware)
//
// SOURCE: master-plan-v1-v20.md v15 12.B Action #1 + v18 9.F updated logic
// PRE-CONDITION: DeepSeek balance > $0 (currently $96.57 per 2026-05-26 screenshot)
// POST-CONDITION: route by task type, not by blind fallback chain
//
// HOW TO APPLY:
//   1. Locate existing alfred-router.js (E:\Desktop\OpenClawAgent\alfred-router.js — scripts live at repo ROOT, no scripts/ subdir)
//   2. Compare pickProvider() function against this file's pickProvider()
//   3. Replace existing function (keep imports + rest of file intact)
//   4. Test: send a few WhatsApp messages, check logs for "provider: deepseek-v4-flash" on bulk
//   5. Verify cost monitor shows mixed providers (Anthropic for quality, DeepSeek for bulk)
//
// ROLLBACK: git revert one commit, restart Alfred gateway

const PROVIDER_PRIORITY = {
  // Quality-critical: customer-facing replies, creative, complex reasoning
  high_quality: [
    { kind: "anthropic", model: "claude-sonnet-4-6" },
    { kind: "deepseek", model: "deepseek-v4-pro" }, // fallback if Anthropic down
  ],

  // Bulk/extraction: intent classification, NER, simple summarization
  bulk: [
    { kind: "deepseek", model: "deepseek-v4-flash" },
    { kind: "anthropic", model: "claude-haiku-4-5-20251001" }, // fallback
  ],

  // Reasoning: planning, multi-step task decomposition
  reasoning: [
    { kind: "deepseek", model: "deepseek-v4-pro" },
    { kind: "anthropic", model: "claude-sonnet-4-6" }, // fallback
  ],

  // Default if classification unknown
  default: [
    { kind: "anthropic", model: "claude-sonnet-4-6" },
    { kind: "deepseek", model: "deepseek-v4-pro" },
  ],
};

/**
 * Classify task to route correctly.
 * Inputs come from upstream (intent classifier).
 *
 * @param {object} task
 * @param {string} task.type - one of: classify, extract, reply, summary, plan, design, draft
 * @param {string} [task.audience] - 'customer' | 'internal' | 'tools'
 * @param {boolean} [task.creative]
 * @returns {string} - 'high_quality' | 'bulk' | 'reasoning' | 'default'
 */
function classifyTask(task) {
  // Customer-facing always high quality
  if (task.audience === "customer") return "high_quality";

  // Creative outputs (Hebrew docx, marketing copy, drafts to humans)
  if (task.creative || task.type === "draft" || task.type === "design") {
    return "high_quality";
  }

  // Bulk operations on incoming data
  if (
    task.type === "classify" ||
    task.type === "extract" ||
    task.type === "summary"
  ) {
    return "bulk";
  }

  // Multi-step / agent planning
  if (
    task.type === "plan" ||
    task.type === "reasoning" ||
    task.type === "multistep"
  ) {
    return "reasoning";
  }

  return "default";
}

/**
 * Pick provider with smart routing + cost-aware fallback.
 *
 * REPLACES the old buggy logic that put DeepSeek first as fallback
 * regardless of task quality requirements (v9 Step 1).
 *
 * @param {object} providers - { anthropic: { apiKey }, deepseek: { apiKey } }
 * @param {object} task - see classifyTask
 * @returns {object} - { kind, apiKey, model }
 */
function pickProvider(providers, task = {}) {
  const tier = classifyTask(task);
  const chain = PROVIDER_PRIORITY[tier];

  for (const candidate of chain) {
    const provider = providers[candidate.kind];
    if (provider?.apiKey) {
      return {
        kind: candidate.kind,
        apiKey: provider.apiKey,
        model: candidate.model,
        tier_used: tier,
      };
    }
  }

  // Should never reach here unless ALL providers down — fatal alert
  throw new Error(
    `No provider available for tier=${tier}. Configured: ${Object.keys(providers)
      .filter((k) => providers[k]?.apiKey)
      .join(", ")}`
  );
}

// ============================================================
// Cost monitoring hook (optional but recommended)
// ============================================================
//
// Wire into existing cost monitor:
// const result = pickProvider(providers, task);
// costMonitor.logRouting({
//   skill: callerSkill,
//   intent: task.type,
//   tier: result.tier_used,
//   provider: result.kind,
//   model: result.model,
//   timestamp: new Date().toISOString(),
// });

module.exports = { pickProvider, classifyTask, PROVIDER_PRIORITY };

// ============================================================
// QUICK TEST (run with: node alfred-router.patched.js)
// ============================================================
if (require.main === module) {
  const fakeProviders = {
    anthropic: { apiKey: "sk-ant-test" },
    deepseek: { apiKey: "sk-ds-test" },
  };

  const tests = [
    { type: "classify", audience: "internal" }, // → bulk → deepseek-flash
    { type: "reply", audience: "customer" }, // → high_quality → claude-sonnet
    { type: "draft", audience: "customer" }, // → high_quality → claude-sonnet
    { type: "plan", audience: "internal" }, // → reasoning → deepseek-v4-pro
    { type: "extract" }, // → bulk → deepseek-flash
    { type: "unknown" }, // → default → claude-sonnet
  ];

  for (const task of tests) {
    const result = pickProvider(fakeProviders, task);
    console.log(`${JSON.stringify(task)}  →  ${result.kind}/${result.model}  (tier=${result.tier_used})`);
  }

  // Test fallback: only DeepSeek available
  console.log("\n=== Test fallback (no Anthropic): ===");
  const fallback = pickProvider({ deepseek: { apiKey: "sk-ds-test" } }, { type: "reply", audience: "customer" });
  console.log(`customer reply with only DeepSeek  →  ${fallback.kind}/${fallback.model}`);
}
