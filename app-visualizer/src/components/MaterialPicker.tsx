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

export function MaterialPicker({
  textures,
  selectedId,
  onSelect,
  disabled = false,
  totalCount,
}: MaterialPickerProps) {
  const [filters, setFilters] = useState<TextureFilterState>({
    search: "",
    colorFamily: "all",
    patternType: "all",
  });

  const filtered = useMemo(() => filterTextures(textures, filters), [textures, filters]);
  const selected = textures.find((t) => t.id === selectedId) ?? null;

  function toggleColorFamily(value: string) {
    setFilters((f) => ({
      ...f,
      colorFamily: f.colorFamily === value ? "all" : value,
    }));
  }

  function togglePatternType(value: string) {
    setFilters((f) => ({
      ...f,
      patternType: f.patternType === value ? "all" : value,
    }));
  }

  return (
    <div className="material-picker">
      <div className="material-toolbar">
        <input
          type="search"
          className="material-search"
          placeholder="Search colors…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          disabled={disabled}
          aria-label="Search colors"
        />

        <div className="filter-chips" role="group" aria-label="Filter by color">
          {COLOR_FILTER_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              className={`filter-chip${filters.colorFamily === color ? " active" : ""}`}
              onClick={() => toggleColorFamily(color)}
              disabled={disabled}
            >
              {color}
            </button>
          ))}
        </div>

        <div className="filter-chips" role="group" aria-label="Filter by pattern">
          {PATTERN_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`filter-chip filter-chip-muted${filters.patternType === value ? " active" : ""}`}
              onClick={() => togglePatternType(value)}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="material-count">
        Showing {filtered.length} of {totalCount} preview colors
      </p>

      {selected ? (
        <div className="selected-swatch">
          <img src={selected.thumbUrl} alt="" />
          <div>
            <strong>{selected.displayName}</strong>
            <span>
              {selected.colorFamily}
              {selected.patternType === "veined" ? " · Veined" : selected.patternType === "solid" ? " · Solid" : ""}
            </span>
          </div>
        </div>
      ) : null}

      <div className="swatch-grid" role="listbox" aria-label="Countertop colors">
        {filtered.map((texture) => (
          <button
            key={texture.id}
            type="button"
            role="option"
            aria-selected={selectedId === texture.id}
            className={`swatch-card${selectedId === texture.id ? " selected" : ""}`}
            onClick={() => onSelect(texture.id)}
            disabled={disabled}
          >
            <span className="swatch-image-wrap">
              <img src={texture.thumbUrl} alt={texture.displayName} loading="lazy" />
            </span>
            <span className="swatch-name">{texture.displayName}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty-hint">No colors match your filters. Try clearing a filter.</p>
      ) : null}
    </div>
  );
}
