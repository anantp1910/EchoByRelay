// Original slate line illustrations for the capability cards (our own art).
const STROKE = "var(--wordmark)";
const FILL = "var(--slate-band)";
const base = { fill: "none", stroke: STROKE, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function CoverageArt() {
  return (
    <svg viewBox="0 0 220 170" aria-hidden className="w-full">
      <rect x="20" y="30" width="170" height="110" rx="14" fill={FILL} />
      <rect x="20" y="30" width="170" height="110" rx="14" {...base} />
      <path d="M20 62 H190" {...base} />
      <path d="M40 92 H110 M40 112 H90" {...base} />
      <circle cx="152" cy="106" r="24" {...base} fill="#fff" />
      <path d="M140 106 l8 8 l16 -18" {...base} />
    </svg>
  );
}

export function BridgeArt() {
  return (
    <svg viewBox="0 0 220 170" aria-hidden className="w-full">
      <path d="M40 70 L110 40 L180 70 L180 140 L110 165 L40 140 Z" fill={FILL} />
      <path d="M40 70 L110 40 L180 70 L180 140 L110 165 L40 140 Z" {...base} />
      <path d="M40 70 L110 98 L180 70 M110 98 V165" {...base} />
      <path d="M75 55 L145 84" {...base} />
    </svg>
  );
}

export function LetterArt() {
  return (
    <svg viewBox="0 0 220 170" aria-hidden className="w-full">
      <path d="M60 20 H140 L170 50 V160 H60 Z" fill={FILL} />
      <path d="M60 20 H140 L170 50 V160 H60 Z M140 20 V50 H170" {...base} />
      <path d="M78 72 H130 M78 94 H150 M78 116 H120 M78 138 H140" {...base} />
      {[72, 94, 116].map((y, i) => (
        <g key={y}>
          <circle cx={i === 1 ? 160 : i === 0 ? 142 : 132} cy={y} r="7" {...base} fill="#fff" strokeWidth={2} />
        </g>
      ))}
    </svg>
  );
}

export function FamilyPayArt() {
  return (
    <svg viewBox="0 0 220 170" aria-hidden className="w-full">
      <rect x="70" y="12" width="84" height="150" rx="16" fill={FILL} />
      <rect x="70" y="12" width="84" height="150" rx="16" {...base} />
      <circle cx="112" cy="86" r="22" {...base} fill="#fff" />
      <path d="M103 86 a9 9 0 0 1 18 0 v6 M108 97 v-9 a4 4 0 0 1 8 0" {...base} strokeWidth={2.5} />
      <path d="M86 132 H138" {...base} />
      <circle cx="120" cy="132" r="5" fill={STROKE} />
    </svg>
  );
}
