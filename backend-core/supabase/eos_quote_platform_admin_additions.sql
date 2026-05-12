-- eliteOS Quote Platform — additive admin / listing indexes (optional)
-- Run manually AFTER eos_quote_platform.sql if you want faster admin list filters.
-- Safe to re-run (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_quote_pricing_rules_structure_active_cat
  ON public.quote_pricing_rules (pricing_structure_id, is_active, category);

COMMENT ON INDEX idx_quote_pricing_rules_structure_active_cat IS
  'Supports System Admin quote pricing rule grids (structure + active + category filters).';
