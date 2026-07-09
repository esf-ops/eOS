import { useMemo, useState } from "react";
import { filterTextures, type TextureFilterState, type VisualizerTexture } from "../lib/textureCatalog";

type MaterialPickerProps = {
  textures: VisualizerTexture[];
  groups: string[];
  colorFamilies: string[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

export function MaterialPicker({
  textures,
  groups,
  colorFamilies,
  selectedId,
  onSelect,
  disabled = false,
}: MaterialPickerProps) {
  const [filters, setFilters] = useState<TextureFilterState>({
    search: "",
    group: "all",
    colorFamily: "all",
  });

  const filtered = useMemo(() => filterTextures(textures, filters), [textures, filters]);
  const selected = textures.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="material-picker">
      <div className="material-picker-toolbar">
        <input
          type="search"
          className="material-search"
          placeholder="Search materials…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          disabled={disabled}
          aria-label="Search materials"
        />
        <div className="material-filters">
          <select
            value={filters.group}
            onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))}
            disabled={disabled}
            aria-label="Filter by collection"
          >
            <option value="all">All collections</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            value={filters.colorFamily}
            onChange={(e) => setFilters((f) => ({ ...f, colorFamily: e.target.value }))}
            disabled={disabled}
            aria-label="Filter by color family"
          >
            <option value="all">All colors</option>
            {colorFamilies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="material-count">
        {filtered.length} of {textures.length} materials
      </p>

      {selected ? (
        <div className="selected-material-card">
          <img src={selected.thumbUrl} alt="" />
          <div>
            <strong>{selected.displayName}</strong>
            <span>{selected.group}{selected.colorFamily ? ` · ${selected.colorFamily}` : ""}</span>
          </div>
        </div>
      ) : null}

      <div className="material-grid" role="listbox" aria-label="Countertop materials">
        {filtered.map((texture) => (
          <button
            key={texture.id}
            type="button"
            role="option"
            aria-selected={selectedId === texture.id}
            className={`material-card${selectedId === texture.id ? " selected" : ""}`}
            onClick={() => onSelect(texture.id)}
            disabled={disabled}
          >
            <img src={texture.thumbUrl} alt={texture.displayName} loading="lazy" />
            <span className="material-card-name">{texture.displayName}</span>
            <span className="material-card-meta">{texture.colorFamily}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty-hint">No materials match your filters.</p>
      ) : null}
    </div>
  );
}
