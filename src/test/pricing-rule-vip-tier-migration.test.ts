import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261112000527_allow_vip_pricing_rule_target.sql', import.meta.url),
  'utf8',
);
const labelMigration = readFileSync(
  new URL('../../supabase/migrations/20261112001302_vip_customer_tier_preview_label.sql', import.meta.url),
  'utf8',
);

describe('VIP pricing rule target migration', () => {
  it('fails closed when the canonical pricing table or target column is missing', () => {
    expect(migration).toMatch(/to_regclass\('public\.pricing_rules'\)\s+is\s+null/i);
    expect(migration).toMatch(/information_schema\.columns[\s\S]*?column_name\s*=\s*'target_tier'/i);
  });

  it('checks for unexpected existing values before replacing the tier constraint', () => {
    const preflight = migration.search(/select\s+count\(\*\)[\s\S]*?v_invalid_count/i);
    const replacement = migration.search(/drop\s+constraint\s+if\s+exists\s+pricing_rules_target_tier_check/i);
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(replacement).toBeGreaterThan(preflight);
    expect(migration).toMatch(/target_tier\s+is\s+null\s+or\s+target_tier\s+not\s+in\s*\(\s*'both'\s*,\s*'vip'\s*,\s*'wholesale'\s*,\s*'retail'\s*\)/i);
  });

  it('adds vip while preserving the combined, wholesale and retail targets', () => {
    expect(migration).toMatch(/add\s+constraint\s+pricing_rules_target_tier_check\s+check\s*\(\s*target_tier\s+in\s*\(\s*'both'\s*,\s*'vip'\s*,\s*'wholesale'\s*,\s*'retail'\s*\)\s*\)/i);
  });
  it('aligns the server preview label with VIP and preserves the legacy tier alias', () => {
    expect(labelMigration).toContain("public.preview_customer_order_pricing(jsonb,text)");
    expect(labelMigration).toMatch(/pg_get_functiondef/i);
    expect(labelMigration).toMatch(/WHEN ''vip'' THEN ''جملة الجملة''/);
    expect(labelMigration).toMatch(/WHEN ''super_wholesale'' THEN ''جملة الجملة''/);
    expect(labelMigration).toMatch(/refusing to replace an unexpected RPC body/i);
  });

});
