"use client";

import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { PROGRAM } from "@/components/labels";
import { ROUTER_PROGRAMS, type PharmaMetricsRes } from "@/lib/api/contracts";

// Single-series charts: one hue (brand teal), text in ink tokens, recessive grid.
const MARK = "var(--echo-accent)"; // teal: the Echo accent
const GRID = "var(--color-line)";
const TICK = { fill: "var(--color-muted-foreground)", fontSize: 12 };
const AXIS_LABEL = { fill: "var(--color-muted-foreground)", fontSize: 12 };

const int = new Intl.NumberFormat("en-US");
const ANIM_MS = 250;

function TipBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="text-muted-foreground">{title}</p>
      <p className="font-mono font-bold tabular">{value}</p>
    </div>
  );
}

export function RescuedLineChart({ series }: { series: PharmaMetricsRes["rescuedSeries"] }) {
  const reduce = useReducedMotion();
  const last = series.at(-1);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={series} margin={{ top: 16, right: 28, bottom: 24, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          label={{ value: "Demo day", position: "insideBottom", offset: -14, ...AXIS_LABEL }}
        />
        <YAxis
          allowDecimals={false}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => int.format(v)}
          label={{ value: "Scripts rescued", angle: -90, position: "insideLeft", offset: 8, ...AXIS_LABEL, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-muted-foreground)", strokeDasharray: "3 3" }}
          content={({ active, payload }: TooltipContentProps<ValueType, NameType>) =>
            active && payload?.length ? (
              <TipBox title={`Day ${payload[0].payload.day}`} value={`${int.format(Number(payload[0].value))} rescued`} />
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke={MARK}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2, fill: MARK }}
          isAnimationActive={!reduce}
          animationDuration={ANIM_MS}
        >
          {/* Selective direct label: the latest value only. */}
          <LabelList
            dataKey="count"
            content={({ x, y, index }) =>
              index === series.length - 1 && last ? (
                <text x={Number(x) + 8} y={Number(y) - 8} fill="var(--color-foreground)" fontSize={13} fontWeight={700}>
                  {int.format(last.count)}
                </text>
              ) : null
            }
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

/** All router programs, zeros included, in contract order. */
export function programRows(mix: PharmaMetricsRes["programMix"]) {
  const counts = new Map(mix.map((m) => [m.program, m.count]));
  return ROUTER_PROGRAMS.map((p) => ({ program: p, short: PROGRAM[p].short, label: PROGRAM[p].label, count: counts.get(p) ?? 0 }));
}

export function ProgramMixChart({ mix }: { mix: PharmaMetricsRes["programMix"] }) {
  const reduce = useReducedMotion();
  const rows = programRows(mix);
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 24, left: 4 }} barCategoryGap={8}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          tickFormatter={(v: number) => int.format(v)}
          label={{ value: "Prescriptions", position: "insideBottom", offset: -14, ...AXIS_LABEL }}
        />
        <YAxis type="category" dataKey="short" tick={TICK} tickLine={false} axisLine={false} width={88} />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
          content={({ active, payload }: TooltipContentProps<ValueType, NameType>) =>
            active && payload?.length ? (
              <TipBox title={payload[0].payload.label} value={`${int.format(Number(payload[0].value))} prescriptions`} />
            ) : null
          }
        />
        <Bar
          dataKey="count"
          fill={MARK}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={!reduce}
          animationDuration={ANIM_MS}
        >
          <LabelList
            dataKey="count"
            position="right"
            fill="var(--color-foreground)"
            fontSize={12}
            formatter={(v: unknown) => int.format(Number(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
