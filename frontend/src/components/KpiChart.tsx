import { useMemo } from 'react';

type DataPoint = {
  timestamp: number;
  value: number;
};

type KpiChartProps = {
  data: DataPoint[];
  unit?: string;
  width?: number;
  height?: number;
  showGrid?: boolean;
};

export function KpiChart({ data, unit = '', width = 300, height = 120, showGrid = true }: KpiChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return null;

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const padding = { top: 10, right: 10, bottom: 20, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = data.map((point, index) => {
      const x = padding.left + (index / (data.length - 1 || 1)) * chartWidth;
      const y = padding.top + chartHeight - ((point.value - min) / range) * chartHeight;
      return { x, y, value: point.value, timestamp: point.timestamp };
    });

    const pathData = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    return { points, pathData, min, max, padding, chartWidth, chartHeight };
  }, [data, width, height]);

  if (!chartData || data.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a1a1aa',
          fontSize: '0.85rem',
          border: '1px solid rgba(250, 204, 21, 0.1)',
          borderRadius: 8,
          background: 'rgba(250, 204, 21, 0.02)'
        }}
      >
        Decrypt entries to see chart
      </div>
    );
  }

  const { points, pathData, min, max, padding } = chartData;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', height, overflow: 'hidden', boxSizing: 'border-box' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', maxWidth: '100%' }}>
        {/* Grid lines */}
        {showGrid && (
          <g>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
              return (
                <line
                  key={ratio}
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(250, 204, 21, 0.1)"
                  strokeWidth="1"
                />
              );
            })}
          </g>
        )}

        {/* Y-axis labels */}
        {[0, 0.5, 1].map((ratio) => {
          const value = min + (max - min) * (1 - ratio);
          const y = padding.top + ratio * (height - padding.top - padding.bottom);
          return (
            <text
              key={ratio}
              x={padding.left - 8}
              y={y + 4}
              fill="#a1a1aa"
              fontSize="10"
              textAnchor="end"
            >
              {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </text>
          );
        })}

        {/* Chart line */}
        <path
          d={pathData}
          fill="none"
          stroke="#facc15"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={3}
            fill="#facc15"
            stroke="#18181b"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
}

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
};

export function Sparkline({ data, width = 100, height = 30, color = '#facc15' }: SparklineProps) {
  if (data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return { x, y };
  });

  const pathData = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

