import type { ChartBar, ChartSeries } from "../types/fleet";

type HorizontalBarsProps = {
  items: ChartBar[];
  formatValue?: (value: number) => string;
};

export function HorizontalBars({ items, formatValue }: HorizontalBarsProps) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="chart-bars">
      {items.map((item) => (
        <li key={item.label}>
          <div className="chart-bar-meta">
            <span>{item.label}</span>
            <strong>{formatValue ? formatValue(item.value) : item.value}</strong>
          </div>
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{
                width: `${Math.max(4, (item.value / max) * 100)}%`,
                background: item.color || "var(--primary)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

type SpendTrendChartProps = {
  series: ChartSeries[];
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { left: 44, right: 12, top: 16, bottom: 36 };

export function SpendTrendChart({ series }: SpendTrendChartProps) {
  const points = series[0]?.data.length || 0;
  const max = Math.max(...series.flatMap((item) => item.data.map((d) => d.value)), 1);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  function x(index: number): number {
    if (points <= 1) return PAD.left + innerW / 2;
    return PAD.left + (index / (points - 1)) * innerW;
  }

  function y(value: number): number {
    return PAD.top + innerH - (value / max) * innerH;
  }

  const labels = series[0]?.data.map((d) => d.label) ?? [];
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Spend over time">
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + innerH}
          className="trend-axis"
        />
        <line
          x1={PAD.left}
          y1={PAD.top + innerH}
          x2={PAD.left + innerW}
          y2={PAD.top + innerH}
          className="trend-axis"
        />
        {series.map((item) => {
          const path = item.data
            .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`)
            .join(" ");
          return (
            <g key={item.label}>
              <path
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {item.data.map((point, index) => (
                <circle key={`${item.label}-${index}`} cx={x(index)} cy={y(point.value)} r="3" fill={item.color} />
              ))}
            </g>
          );
        })}
        {labels.map((label, index) =>
          index % labelEvery === 0 || index === labels.length - 1 ? (
            <text key={`${label}-${index}`} x={x(index)} y={HEIGHT - 10} className="trend-label">
              {label}
            </text>
          ) : null,
        )}
      </svg>
      <ul className="chart-legend">
        {series.map((item) => (
          <li key={item.label}>
            <span className="chart-swatch" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
