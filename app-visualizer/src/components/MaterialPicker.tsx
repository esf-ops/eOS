import { useMemo, useState } from "react";
import {
  COLOR_FILTER_OPTIONS,
  filterTextures,
  PATTERN_FILTER_OPTIONS,
  type TextureFilterState,
  type VisualizerTexture,
} from "../lib/textureCatalog";

type MaterialPickerProps = {
  textures: VisualizerTexture[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  totalCount: number;
};

const INITIAL_FILTERS: TextureFilterState = {
  search: "",
  colorFamily: "all",
  patternType: "all",
};

function patternLabel(patternType: VisualizerTexture["patternType"]): string {
  if (patternType === "veined") return "Veined";
  if (patternType === "solid") return "Solid";
  if (patternType === "speckled") return "Speckled";
  return "";
}

export function MaterialPicker({
  textures,
  selectedId,
  onSelect,
  disabled = false,
  totalCount,
}: MaterialPickerProps) {
  const [filters, setFilters] = useState<TextureFilterState>(INITIAL_FILTERS);

  const filtered = useMemo(() => filterTextures(textures, filters), [textures, filters]);
  const selected = textures.find((t) => t.id === selectedId) ?? null;
  const hasActiveFilters =
    filters.search.trim() !== "" || filters.colorFamily !== "all" || filters.patternType !== "all";

  function toggleColorFamily(value: string) {
    setFilters((f) => ({ ...f, colorFamily: f.colorFamily === value ? "all" : value }));
  }

  function togglePatternType(value: string) {
    setFilters((f) => ({ ...f, patternType: f.patternType === value ? "all" : value }));
  }

  return (
    <div className="viz-picker">
      <div className="viz-picker-toolbar">
        <div className="viz-search-wrap">
          <svg className="viz-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="viz-search"
            placeholder="Search colors…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            disabled={disabled}
            aria-label="Search colors"
          />
        </div>

        <div className="viz-chips" role="group" aria-label="Filter by color">
          {COLOR_FILTER_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              className={`viz-chip${filters.colorFamily === color ? " is-active" : ""}`}
              onClick={() => toggleColorFamily(color)}
              disabled={disabled}
            >
              {color}
            </button>
          ))}
          {PATTERN_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`viz-chip viz-chip-muted${filters.patternType === value ? " is-active" : ""}`}
              onClick={() => togglePatternType(value)}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="viz-picker-meta">
        <span className="viz-picker-count">
          Showing {filtered.length} of {totalCount}
        </span>
        {hasActiveFilters ? (
          <button
            type="button"
            className="viz-clear-filters"
            onClick={() => setFilters(INITIAL_FILTERS)}
            disabled={disabled}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="viz-swatch-grid" role="listbox" aria-label="Countertop colors">
        {filtered.map((texture) => (
          <button
            key={texture.id}
            type="button"
            role="option"
            aria-selected={selectedId === texture.id}
            className={`viz-swatch${selectedId === texture.id ? " is-selected" : ""}`}
            onClick={() => onSelect(texture.id)}
            disabled={disabled}
            title={texture.displayName}
          >
            <span className="viz-swatch-image">
              <img src={texture.thumbUrl} alt={texture.displayName} loading="lazy" draggable={false} />
            </span>
            <span className="viz-swatch-name">{texture.displayName}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="viz-empty-hint">No colors match your filters. Try clearing a filter.</p>
      ) : null}

      {selected ? (
        <div className="viz-selected">
          <img src={selected.thumbUrl} alt="" draggable={false} />
          <div className="viz-selected-info">
            <strong>{selected.displayName}</strong>
            <span>
              {[selected.colorFamily, patternLabel(selected.patternType)].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
