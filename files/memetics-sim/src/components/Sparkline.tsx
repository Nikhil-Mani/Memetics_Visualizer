interface Props {
  values: number[];
  color: string;
  min?: number;
  max?: number;
  height?: number;
  baseline?: number;
  label?: string;
}

/** Small multiples for metric history — no axes, the numbers above carry the value. */
export default function Sparkline({
  values,
  color,
  min = 0,
  max = 1,
  height = 38,
  baseline,
}: Props) {
  const width = 240;
  if (values.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden />;
  }
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const y = (v: number) => height - ((v - min) / span) * height;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden
    >
      {baseline !== undefined && (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#1B2530"
          strokeDasharray="3 4"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
