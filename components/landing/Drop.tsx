import { useId, type SVGProps } from "react";

import { cn } from "@/lib/utils";

// The Echo drop: a soft, glossy pebble built from SVG gradients (no 3D, no
// images). Our own object; the reference only informed the "soft white form"
// idea. Filters are static, so it costs nothing while scrolling.

/** Outline of the drop in a 400×400 box (also used to clip the hero's outline text). */
export const DROP_PATH =
  "M238 34 C 318 40 372 118 352 208 C 332 296 262 364 178 358 C 96 352 38 282 50 198 C 62 118 150 28 238 34 Z";

export function Drop({
  className,
  ripples = false,
  tint = false,
  place,
}: {
  className?: string;
  /** Position when nested inside another SVG (x, y, width, height). */
  place?: Pick<SVGProps<SVGSVGElement>, "x" | "y" | "width" | "height">;
  /** Faint concentric "echo" rings around the drop. */
  ripples?: boolean;
  /** Teal glint in the highlight (the patient-journey accent). */
  tint?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="-40 -40 480 500" className={cn("overflow-visible", className)} aria-hidden {...place}>
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="30%" r="78%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#f1f3f7" />
          <stop offset="0.8" stopColor="#d5dbe4" />
          <stop offset="1" stopColor="#b3bcc9" />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="70%" cy="78%" r="55%">
          <stop offset="0" stopColor="#8e98a8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8e98a8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-glint`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={tint ? "#bff3ee" : "#ffffff"} stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={`${id}-shadow`} x="-80%" y="-400%" width="260%" height="900%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <path d={DROP_PATH} />
        </clipPath>
      </defs>

      {ripples &&
        [0, 1.6, 3.2].map((delay) => (
          <path
            key={delay}
            d={DROP_PATH}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
            className="echo-ripple"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}

      {/* Cast shadow */}
      <ellipse cx="210" cy="410" rx="130" ry="22" fill="#5d6778" opacity="0.28" filter={`url(#${id}-shadow)`} />

      {/* Body, inner shading, highlight */}
      <path d={DROP_PATH} fill={`url(#${id}-body)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <path d={DROP_PATH} fill={`url(#${id}-shade)`} />
        <path
          d={DROP_PATH}
          fill="none"
          stroke="#7f8a9b"
          strokeOpacity="0.35"
          strokeWidth="26"
          filter={`url(#${id}-soft)`}
          transform="translate(10 14)"
        />
        <ellipse cx="170" cy="120" rx="70" ry="44" fill={`url(#${id}-glint)`} transform="rotate(-28 170 120)" />
      </g>
    </svg>
  );
}
