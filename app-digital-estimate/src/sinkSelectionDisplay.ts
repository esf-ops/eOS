type SinkChoice = {
  sourceKind?: string | null;
  selected?: boolean;
};

/**
 * A finish-specific saved option key may be more specific than the product-level
 * envelope option. In that case the view model falls back to the baseline
 * "none" choice even though the persisted customer draft still identifies the
 * selected product. Preserve that persisted product instead of displaying a
 * false "No sink".
 */
export function shouldPreservePersistedSinkDraft(
  selected: SinkChoice | null | undefined,
  persistedSource: string | null | undefined,
): boolean {
  return (
    selected?.sourceKind === "none" &&
    selected.selected !== true &&
    Boolean(persistedSource) &&
    persistedSource !== "none"
  );
}
