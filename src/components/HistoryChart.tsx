import type { ObservationBucket } from "../types";

export function HistoryChart({ history }: { history: ObservationBucket[] }) {
  if (history.length < 2) {
    return <div className="chart-empty">History appears after the first 10-second observation bucket.</div>;
  }
  const points = history.slice(-120);
  const width = 520;
  const height = 150;
  const padding = 14;
  const maxDistance = Math.max(...points.map((point) => point.avgDistance), 1);
  const x = (index: number) => padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
  const y = (distance: number) => height - padding - (distance / maxDistance) * (height - padding * 2);
  const polyline = points.map((point, index) => `${x(index)},${y(point.avgDistance)}`).join(" ");

  return (
    <div className="history-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Estimated distance history chart">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#6fffe9" stopOpacity=".3" />
            <stop offset="1" stopColor="#6fffe9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1={padding} x2={width - padding} y1={height * ratio} y2={height * ratio} stroke="#91b8be" strokeOpacity=".12" />
        ))}
        <polygon points={`${padding},${height - padding} ${polyline} ${width - padding},${height - padding}`} fill="url(#chartFill)" />
        <polyline points={polyline} fill="none" stroke="#6fffe9" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <div className="chart-axis"><span>{new Date(points[0].bucketStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><strong>distance · max {maxDistance.toFixed(1)}m</strong><span>now</span></div>
    </div>
  );
}
