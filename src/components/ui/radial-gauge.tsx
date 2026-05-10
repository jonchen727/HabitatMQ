"use client"

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Label,
} from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

interface RadialGaugeProps {
  value: number
  min: number
  max: number
  unit: string
  color: string
  size?: number
  label?: string
}

export function RadialGauge({
  value,
  min,
  max,
  color,
  unit,
  size = 100,
  label,
}: RadialGaugeProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const data = [{ value: pct, fill: color }]

  const config = {
    value: { label: label ?? unit, color },
  } satisfies ChartConfig

  return (
    <ChartContainer
      config={config}
      className="aspect-square"
      style={{ width: size, height: size }}
    >
      <RadialBarChart
        data={data}
        startAngle={210}
        endAngle={-30}
        innerRadius="65%"
        outerRadius="95%"
        barSize={size > 80 ? 8 : 5}
      >
        <PolarAngleAxis
          type="number"
          domain={[0, 100]}
          angleAxisId={0}
          tick={false}
        />
        <RadialBar
          dataKey="value"
          cornerRadius={12}
          background={{ fill: "rgba(255,255,255,0.04)" }}
          isAnimationActive
          animationDuration={1200}
          animationEasing="ease-out"
        />
        {/* Center label */}
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          <tspan
            x="50%"
            dy="0"
            className="fill-foreground font-bold tabular-nums"
            style={{ fontSize: size > 80 ? 18 : 14, fill: color }}
          >
            {value.toFixed(1)}
          </tspan>
          <tspan
            x="50%"
            dy={size > 80 ? 16 : 13}
            className="fill-muted-foreground font-medium uppercase"
            style={{ fontSize: 8, letterSpacing: "0.08em" }}
          >
            {unit}
          </tspan>
        </text>
      </RadialBarChart>
    </ChartContainer>
  )
}
