import { AGE_BUCKET_LABELS } from "../domain/age.mjs";
import { QUOTE_INTAKE_STATUSES, statusLabel } from "../domain/statuses.mjs";
import type { QuoteIntakeFilter } from "../domain/types";

type Props = {
  filter: QuoteIntakeFilter;
  salespeople: string[];
  estimators: string[];
  onChange: (next: QuoteIntakeFilter) => void;
};

export default function QueueFilters({ filter, salespeople, estimators, onChange }: Props) {
  function patch(partial: Partial<QuoteIntakeFilter>) {
    onChange({ ...filter, ...partial });
  }

  return (
    <section className="qil-filters" aria-label="Queue filters">
      <label className="qil-field qil-field-search">
        <span>Search</span>
        <input
          type="search"
          placeholder="Customer, project, sender, color…"
          value={filter.search ?? ""}
          onChange={(e) => patch({ search: e.target.value })}
        />
      </label>

      <label className="qil-field">
        <span>Status</span>
        <select value={filter.status ?? ""} onChange={(e) => patch({ status: e.target.value })}>
          <option value="">All statuses</option>
          {QUOTE_INTAKE_STATUSES.map((s: string) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="qil-field">
        <span>Priority</span>
        <select value={filter.priority ?? ""} onChange={(e) => patch({ priority: e.target.value })}>
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>

      <label className="qil-field">
        <span>Salesperson</span>
        <select value={filter.salesperson ?? ""} onChange={(e) => patch({ salesperson: e.target.value })}>
          <option value="">All salespeople</option>
          {salespeople.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="qil-field">
        <span>Estimator</span>
        <select value={filter.estimator ?? ""} onChange={(e) => patch({ estimator: e.target.value })}>
          <option value="">All estimators</option>
          <option value="__unassigned__">Unassigned</option>
          {estimators.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="qil-field">
        <span>Age / turnaround</span>
        <select value={filter.ageBucket ?? ""} onChange={(e) => patch({ ageBucket: e.target.value })}>
          <option value="">Any age</option>
          {Object.entries(AGE_BUCKET_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="qil-field">
        <span>Missing information</span>
        <select
          value={filter.missingInfo ?? "any"}
          onChange={(e) => patch({ missingInfo: e.target.value as QuoteIntakeFilter["missingInfo"] })}
        >
          <option value="any">Any</option>
          <option value="has_missing">Has missing fields</option>
          <option value="none_missing">No missing fields</option>
        </select>
      </label>
    </section>
  );
}
