import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatMoney, formatPct, formatYmdUtc } from "../lib/financeViewModel";
import { useViewportOnce } from "./financeMotion";

export type PnlTrendPoint = {
  period_start: string;
  period_end: string;
  revenue: number | null;
  cogs?: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  operating_expenses?: number | null;
  net_income: number | null;
  coverage_key?: string;
};

export type PnlComparison = {
  period_start: string;
  comparison_period_start?: string | null;
  comparable: boolean;
  revenue_variance?: number | null;
  gross_profit_variance?: number | null;
  gross_margin_point_change?: number | null;
  net_income_variance?: number | null;
  notes?: string | null;
};

type PnlMetric = "revenue" | "gross_profit" | "gross_margin_pct" | "net_income";

const PNL_METRICS: Array<{
  key: PnlMetric;
  label: string;
  color: string;
  priorColor: string;
  format: (value: number | null | undefined) => string;
  varianceKey: keyof PnlComparison;
}> = [
  {
    key: "revenue",
    label: "Revenue",
    color: "#244f88",
    priorColor: "#99afd0",
    format: formatMoney,
    varianceKey: "revenue_variance",
  },
  {
    key: "gross_profit",
    label: "Gross Profit",
    color: "#4a2c7c",
    priorColor: "#b3a4cc",
    format: formatMoney,
    varianceKey: "gross_profit_variance",
  },
  {
    key: "gross_margin_pct",
    label: "Gross Margin",
    color: "#0f756b",
    priorColor: "#93c7c1",
    format: formatPct,
    varianceKey: "gross_margin_point_change",
  },
  {
    key: "net_income",
    label: "Net Income",
    color: "#a3132f",
    priorColor: "#d8a4af",
    format: formatMoney,
    varianceKey: "net_income_variance",
  },
];

function monthShort(value: string): string {
  const month = Number(String(value).slice(5, 7));
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    month - 1
  ] || "—";
}

function moneyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? "−" : ""}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${value < 0 ? "−" : ""}$${Math.round(abs / 1_000)}k`;
  return `${value < 0 ? "−" : ""}$${Math.round(abs)}`;
}

function scalePath(
  points: Array<{ x: number; value: number; source: PnlTrendPoint }>,
  min: number,
  max: number,
) {
  const width = 760;
  const height = 246;
  const left = 42;
  const right = 18;
  const top = 16;
  const bottom = 32;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const range = max - min || 1;
  const coords = points.map((point) => ({
    ...point,
    sx: left + point.x * innerW,
    sy: top + (1 - (point.value - min) / range) * innerH,
  }));
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    innerW,
    innerH,
    coords,
    d: coords.map((point, index) => `${index ? "L" : "M"} ${point.sx} ${point.sy}`).join(" "),
  };
}

export function PnlTrendChart({
  points,
  comparisons = [],
  motionKey,
  initialMetric = "revenue",
  onSelectPeriod,
}: {
  points: PnlTrendPoint[];
  comparisons?: PnlComparison[];
  motionKey: string;
  initialMetric?: PnlMetric;
  onSelectPeriod?: (point: PnlTrendPoint) => void;
}) {
  const [metric, setMetric] = useState<PnlMetric>(initialMetric);
  const [view, setView] = useState<"compare" | "timeline">("compare");
  const [active, setActive] = useState<{ point: PnlTrendPoint; comparison?: PnlComparison } | null>(
    null,
  );
  const { ref, visible } = useViewportOnce<HTMLDivElement>(`chart:${motionKey}`);
  const spec = PNL_METRICS.find((item) => item.key === metric) || PNL_METRICS[0];

  const model = useMemo(() => {
    const valid = points.filter((point) => Number.isFinite(Number(point[metric])));
    if (!valid.length) return null;
    const years = [...new Set(valid.map((point) => String(point.period_start).slice(0, 4)))].sort();
    const currentYear = years.at(-1) || "";
    const priorYear = years.at(-2) || "";
    const comparableByCurrent = new Map(comparisons.map((comparison) => [comparison.period_start, comparison]));
    let current: PnlTrendPoint[];
    let prior: PnlTrendPoint[];
    if (view === "compare") {
      current = valid.filter((point) => point.period_start.startsWith(currentYear));
      const comparablePriorStarts = new Set(
        current
          .map((point) => comparableByCurrent.get(point.period_start))
          .filter((comparison) => comparison?.comparable && comparison.comparison_period_start)
          .map((comparison) => String(comparison?.comparison_period_start)),
      );
      prior = valid.filter(
        (point) => point.period_start.startsWith(priorYear) && comparablePriorStarts.has(point.period_start),
      );
    } else {
      current = valid;
      prior = [];
    }
    const currentPlot = current.map((point, index) => ({
      x:
        view === "compare"
          ? (Number(point.period_start.slice(5, 7)) - 1) / 11
          : current.length === 1
            ? 0
            : index / (current.length - 1),
      value: Number(point[metric]),
      source: point,
    }));
    const priorPlot = prior.map((point) => ({
      x: (Number(point.period_start.slice(5, 7)) - 1) / 11,
      value: Number(point[metric]),
      source: point,
    }));
    const allValues = [...currentPlot, ...priorPlot].map((point) => point.value);
    let min = Math.min(...allValues);
    let max = Math.max(...allValues);
    if (metric !== "gross_margin_pct") {
      min = Math.min(0, min);
      max = Math.max(0, max);
    } else {
      const pad = Math.max(2, (max - min) * 0.15);
      min -= pad;
      max += pad;
    }
    return {
      years,
      currentYear,
      priorYear,
      current: scalePath(currentPlot, min, max),
      prior: scalePath(priorPlot, min, max),
      min,
      max,
      comparableByCurrent,
    };
  }, [comparisons, metric, points, view]);

  if (!model) {
    return <div className="fin-empty">Monthly P&amp;L trend is unavailable.</div>;
  }

  const activeValue = active?.point[metric] as number | null | undefined;
  const activeComparison = active?.comparison;
  const variance = activeComparison?.comparable
    ? (activeComparison[spec.varianceKey] as number | null | undefined)
    : null;

  return (
    <div ref={ref} className={`fin-chart${visible ? " is-visible" : ""}`}>
      <div className="fin-chart-toolbar">
        <div className="fin-segmented" aria-label="P&L metric">
          {PNL_METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={metric === item.key ? "is-active" : ""}
              aria-pressed={metric === item.key}
              onClick={() => {
                setMetric(item.key);
                setActive(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="fin-segmented fin-segmented-quiet" aria-label="Trend view">
          <button
            type="button"
            className={view === "compare" ? "is-active" : ""}
            aria-pressed={view === "compare"}
            onClick={() => setView("compare")}
          >
            Compare years
          </button>
          <button
            type="button"
            className={view === "timeline" ? "is-active" : ""}
            aria-pressed={view === "timeline"}
            onClick={() => setView("timeline")}
          >
            Timeline
          </button>
        </div>
      </div>
      <div className="fin-chart-stage">
        <svg
          viewBox={`0 0 ${model.current.width} ${model.current.height}`}
          role="img"
          aria-label={`${spec.label} monthly trend`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = model.current.top + ratio * model.current.innerH;
            const value = model.max - ratio * (model.max - model.min);
            return (
              <g key={ratio}>
                <line
                  className="fin-chart-gridline"
                  x1={model.current.left}
                  x2={model.current.width - model.current.right}
                  y1={y}
                  y2={y}
                />
                <text className="fin-chart-axis-label" x={0} y={y + 3}>
                  {metric === "gross_margin_pct" ? `${Math.round(value)}%` : moneyCompact(value)}
                </text>
              </g>
            );
          })}
          {model.prior.d ? (
            <path
              className="fin-chart-line is-prior"
              pathLength={1}
              d={model.prior.d}
              style={{ "--series-color": spec.priorColor } as CSSProperties}
            />
          ) : null}
          <path
            className="fin-chart-line is-current"
            pathLength={1}
            d={model.current.d}
            style={{ "--series-color": spec.color } as CSSProperties}
          />
          {model.current.coords.map((coord) => {
            const comparison = model.comparableByCurrent.get(coord.source.period_start);
            return (
              <circle
                key={coord.source.period_start}
                className="fin-chart-point"
                cx={coord.sx}
                cy={coord.sy}
                r={5}
                tabIndex={0}
                role={onSelectPeriod ? "button" : undefined}
                aria-label={`${formatYmdUtc(coord.source.period_start)} ${spec.label} ${spec.format(coord.value)}`}
                onMouseEnter={() => setActive({ point: coord.source, comparison })}
                onFocus={() => setActive({ point: coord.source, comparison })}
                onClick={() => onSelectPeriod?.(coord.source)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectPeriod?.(coord.source);
                  }
                }}
                style={{ "--series-color": spec.color } as CSSProperties}
              />
            );
          })}
          {(view === "compare"
            ? Array.from({ length: 12 }, (_, month) => ({ x: month / 11, label: monthShort(`2026-${String(month + 1).padStart(2, "0")}-01`) }))
            : model.current.coords.map((coord) => ({
                x: (coord.sx - model.current.left) / model.current.innerW,
                label: `${monthShort(coord.source.period_start)} ’${coord.source.period_start.slice(2, 4)}`,
              }))
          ).map((tick, index, ticks) => {
            if (view === "timeline" && ticks.length > 12 && index % 2) return null;
            return (
              <text
                key={`${tick.label}-${index}`}
                className="fin-chart-x-label"
                x={model.current.left + tick.x * model.current.innerW}
                y={model.current.height - 8}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="fin-chart-legend" aria-hidden="true">
        <span style={{ "--legend-color": spec.color } as CSSProperties}>
          {view === "compare" ? model.currentYear : "Monthly actual"}
        </span>
        {view === "compare" && model.prior.d ? (
          <span style={{ "--legend-color": spec.priorColor } as CSSProperties}>
            {model.priorYear} · comparable months only
          </span>
        ) : null}
      </div>
      <div className="fin-chart-readout" aria-live="polite">
        {active ? (
          <>
            <span>
              {formatYmdUtc(active.point.period_start)} – {formatYmdUtc(active.point.period_end)}
            </span>
            <strong>{spec.format(activeValue)}</strong>
            {activeComparison?.comparable && variance != null ? (
              <small>
                YoY {metric === "gross_margin_pct" ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)} pts` : spec.format(variance)}
              </small>
            ) : (
              <small>{activeComparison?.notes || "Hover or focus a month for exact context."}</small>
            )}
          </>
        ) : (
          <small>Hover or focus a month for exact period and value context.</small>
        )}
      </div>
    </div>
  );
}

export function AgingDistribution({
  rows,
  total,
  motionKey,
}: {
  rows: Array<{ key: string; label: string; amount: number | null }>;
  total: number | null | undefined;
  motionKey: string;
}) {
  const { ref, visible } = useViewportOnce<HTMLDivElement>(`aging:${motionKey}`);
  const denominator = Number(total) || 0;
  return (
    <div ref={ref} className={`fin-aging-chart${visible ? " is-visible" : ""}`}>
      {rows.map((row, index) => {
        const share = denominator > 0 && row.amount != null ? (Number(row.amount) / denominator) * 100 : 0;
        return (
          <div className="fin-aging-row" key={row.key}>
            <div>
              <span>{row.label}</span>
              <strong>{formatMoney(row.amount)}</strong>
            </div>
            <div className="fin-meter" aria-label={`${row.label} ${share.toFixed(1)}%`}>
              <i
                style={
                  {
                    "--meter-width": `${Math.max(0, Math.min(100, share))}%`,
                    "--meter-delay": `${index * 70}ms`,
                  } as CSSProperties
                }
              />
            </div>
            <small>{share.toFixed(1)}%</small>
          </div>
        );
      })}
    </div>
  );
}

export function ExposureBars({
  rows,
  amountKey,
  labelKey,
  motionKey,
  onSelect,
}: {
  rows: Array<Record<string, unknown>>;
  amountKey: string;
  labelKey: string;
  motionKey: string;
  onSelect?: (row: Record<string, unknown>) => void;
}) {
  const { ref, visible } = useViewportOnce<HTMLDivElement>(`exposure:${motionKey}`);
  const max = Math.max(1, ...rows.map((row) => Number(row[amountKey]) || 0));
  return (
    <div ref={ref} className={`fin-exposure-chart${visible ? " is-visible" : ""}`}>
      {rows.map((row, index) => {
        const label = String(row[labelKey] || "Unnamed");
        const amount = Number(row[amountKey]) || 0;
        return (
          <button key={`${label}-${index}`} type="button" onClick={() => onSelect?.(row)}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{label}</strong>
            <b>{formatMoney(amount)}</b>
            <i
              style={
                {
                  "--exposure-width": `${Math.max(2, (amount / max) * 100)}%`,
                  "--meter-delay": `${index * 55}ms`,
                } as CSSProperties
              }
            />
          </button>
        );
      })}
    </div>
  );
}

type CashPoint = {
  month: string;
  bank_deposit?: number | null;
  bank_disbursement?: number | null;
  customer_receipt?: number | null;
  transfer?: number | null;
};

type CashRole = keyof Omit<CashPoint, "month">;

export function CashActivityChart({
  points,
  motionKey,
  availableRoles,
}: {
  points: CashPoint[];
  motionKey: string;
  availableRoles?: CashRole[];
}) {
  const { ref, visible } = useViewportOnce<HTMLDivElement>(`cash:${motionKey}`);
  const [activeRole, setActiveRole] = useState<CashRole>("bank_deposit");
  const specs = {
    bank_deposit: { label: "Bank deposits", color: "#244f88" },
    bank_disbursement: { label: "Checks / disbursements", color: "#a3132f" },
    customer_receipt: { label: "Customer receipts", color: "#0f756b" },
    transfer: { label: "Transfers", color: "#4a2c7c" },
  };
  const shownRoles = (Object.keys(specs) as CashRole[]).filter(
    (role) => !availableRoles?.length || availableRoles.includes(role),
  );
  useEffect(() => {
    if (!shownRoles.includes(activeRole) && shownRoles[0]) setActiveRole(shownRoles[0]);
  }, [activeRole, shownRoles]);
  const max = Math.max(1, ...points.map((point) => Number(point[activeRole]) || 0));
  return (
    <div ref={ref} className={`fin-cash-chart${visible ? " is-visible" : ""}`}>
      <div className="fin-segmented" aria-label="Cash activity series">
        {shownRoles.map((key) => (
          <button
            key={key}
            type="button"
            className={activeRole === key ? "is-active" : ""}
            aria-pressed={activeRole === key}
            onClick={() => setActiveRole(key)}
          >
            {specs[key].label}
          </button>
        ))}
      </div>
      <div className="fin-cash-bars">
        {points.slice(-12).map((point, index) => {
          const value = Number(point[activeRole]) || 0;
          return (
            <div className="fin-cash-bar" key={point.month}>
              <div>
                <i
                  title={`${point.month}: ${formatMoney(value)}`}
                  style={
                    {
                      "--bar-height": `${Math.max(value === 0 ? 0 : 4, (Math.abs(value) / max) * 100)}%`,
                      "--bar-color": specs[activeRole].color,
                      "--meter-delay": `${index * 45}ms`,
                    } as CSSProperties
                  }
                />
              </div>
              <strong>{formatMoney(value)}</strong>
              <span>{monthShort(`${point.month}-01`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
