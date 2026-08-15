import { useMemo, useState, type CSSProperties } from "react";
import { formatMoney } from "./accountFormat";
import { useViewportOnce } from "./accountMotion";

export type TrendPoint = {
  month: string;
  invoiced?: number;
  collected?: number;
  sales_orders?: number;
  quoted?: number;
};

type SeriesKey = "invoiced" | "collected" | "sales_orders" | "quoted";

const SERIES: Array<{ key: SeriesKey; label: string; color: string }> = [
  { key: "invoiced", label: "Invoiced", color: "#244f88" },
  { key: "collected", label: "Collected", color: "#0c6e3a" },
  { key: "sales_orders", label: "Sales orders", color: "#4a2c7c" },
  { key: "quoted", label: "Quoted", color: "#a3132f" }
];

function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [y, m] = month.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`;
}

export function CustomerTrendChart({
  points,
  motionKey,
  onSelectMonth
}: {
  points: TrendPoint[];
  motionKey: string;
  onSelectMonth?: (month: string) => void;
}) {
  const { ref, visible } = useViewportOnce<HTMLDivElement>(motionKey);
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    invoiced: true,
    collected: true,
    sales_orders: false,
    quoted: false
  });
  const [hover, setHover] = useState<{ month: string; key: SeriesKey; amount: number } | null>(null);

  const width = 720;
  const height = 220;
  const pad = { l: 44, r: 16, t: 18, b: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const max = useMemo(() => {
    let n = 0;
    for (const point of points) {
      for (const series of SERIES) {
        if (!enabled[series.key]) continue;
        n = Math.max(n, Number(point[series.key] || 0));
      }
    }
    return n || 1;
  }, [enabled, points]);

  if (!points.length) {
    return <div className="ad-empty">Customer monthly trend is unavailable.</div>;
  }

  const xFor = (i: number) => pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yFor = (value: number) => pad.t + innerH - (value / max) * innerH;

  return (
    <div ref={ref} className="ad-chart">
      <div className="ad-chart-toggles" role="group" aria-label="Trend series">
        {SERIES.map((series) => (
          <button
            key={series.key}
            type="button"
            className={enabled[series.key] ? "is-on" : ""}
            style={{ "--ad-series": series.color } as CSSProperties}
            onClick={() => setEnabled((prev) => ({ ...prev, [series.key]: !prev[series.key] }))}
          >
            {series.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Customer monthly financial trend">
        {SERIES.filter((series) => enabled[series.key]).map((series) => {
          const d = points
            .map((point, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(Number(point[series.key] || 0))}`)
            .join(" ");
          return (
            <path
              key={series.key}
              className={`ad-chart-line${visible ? " is-visible" : ""}`}
              d={d}
              fill="none"
              stroke={series.color}
              strokeWidth="2.4"
            />
          );
        })}
        {points.map((point, i) =>
          SERIES.filter((series) => enabled[series.key]).map((series) => {
            const amount = Number(point[series.key] || 0);
            return (
              <circle
                key={`${point.month}-${series.key}`}
                className={`ad-chart-point${visible ? " is-visible" : ""}`}
                cx={xFor(i)}
                cy={yFor(amount)}
                r="4"
                fill={series.color}
                onMouseEnter={() => setHover({ month: point.month, key: series.key, amount })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectMonth?.(point.month)}
              />
            );
          })
        )}
        {points.map((point, i) => (
          <text key={point.month} x={xFor(i)} y={height - 8} textAnchor="middle" className="ad-chart-label">
            {point.month.slice(5)}
          </text>
        ))}
      </svg>
      {hover ? (
        <div className="ad-chart-tip" role="status">
          <strong>{monthLabel(hover.month)}</strong>
          <span>{SERIES.find((s) => s.key === hover.key)?.label}</span>
          <span>{formatMoney(hover.amount)}</span>
        </div>
      ) : (
        <p className="muted">Hover a point for month, metric, and exact amount.</p>
      )}
    </div>
  );
}
