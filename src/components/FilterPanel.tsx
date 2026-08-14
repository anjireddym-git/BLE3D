import { Search, SlidersHorizontal } from "lucide-react";
import type { DeviceFilters } from "../types";

interface Props {
  filters: DeviceFilters;
  setFilters: (filters: DeviceFilters) => void;
  visibleCount: number;
  totalCount: number;
  unidentifiedCount: number;
}

export function FilterPanel({ filters, setFilters, visibleCount, totalCount, unidentifiedCount }: Props) {
  const patch = (next: Partial<DeviceFilters>) => setFilters({ ...filters, ...next });
  return (
    <section className="filter-panel" aria-labelledby="filter-title">
      <div className="panel-heading">
        <span id="filter-title"><SlidersHorizontal size={14} /> Filters</span>
        <small>{visibleCount}/{totalCount}</small>
      </div>
      <label className="search-box">
        <Search size={15} aria-hidden="true" />
        <input
          value={filters.query}
          onChange={(event) => patch({ query: event.target.value })}
          placeholder="Search devices"
          aria-label="Search devices"
        />
      </label>
      {unidentifiedCount > 0 && (
        <div className="unidentified-summary">
          <span><strong>{unidentifiedCount} unidentified</strong><small>{filters.showUnidentified ? "shown on map" : "grouped and hidden"}</small></span>
          <button type="button" onClick={() => patch({ showUnidentified: !filters.showUnidentified })}>{filters.showUnidentified ? "Hide" : "Show"}</button>
        </div>
      )}
      <div className="filter-grid">
        <label>
          <span>Range confidence</span>
          <select value={filters.confidence} onChange={(event) => patch({ confidence: event.target.value as DeviceFilters["confidence"] })}>
            <option value="all">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </label>
        <label>
          <span>State</span>
          <select value={filters.state} onChange={(event) => patch({ state: event.target.value as DeviceFilters["state"] })}>
            <option value="all">All</option><option value="active">Active</option><option value="stale">Stale</option>
          </select>
        </label>
      </div>
      <label className="range-row">
        <span>Range ≤ {filters.maxDistance} m</span>
        <input type="range" min="1" max="50" value={filters.maxDistance} onChange={(event) => patch({ maxDistance: Number(event.target.value) })} />
      </label>
      <label className="range-row">
        <span>Signal ≥ {filters.minRssi} dBm</span>
        <input type="range" min="-105" max="-30" value={filters.minRssi} onChange={(event) => patch({ minRssi: Number(event.target.value) })} />
      </label>
      <details>
        <summary>Advanced filters</summary>
        <div className="advanced-filters">
          <label><span>Manufacturer</span><input value={filters.manufacturer} onChange={(event) => patch({ manufacturer: event.target.value })} placeholder="Apple or 76" /></label>
          <label><span>Service</span><input value={filters.service} onChange={(event) => patch({ service: event.target.value })} placeholder="Heart Rate or 180D" /></label>
          <label className="check-row"><input type="checkbox" checked={filters.showUnnamed} onChange={(event) => patch({ showUnnamed: event.target.checked })} /> Show unnamed devices</label>
          <label className="check-row"><input type="checkbox" checked={filters.showUnidentified} onChange={(event) => patch({ showUnidentified: event.target.checked })} /> Show unidentified signals ({unidentifiedCount})</label>
        </div>
      </details>
    </section>
  );
}
