"use client"

import { AreaChart, Area } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

interface MiniAreaChartProps {
  data: number[]
  color: string
  width?: number
  height?: number
}

export function MiniAreaChart({
  data,
  color,
  width = 80,
  height = 32,
}: MiniAreaChartProps) {
  if (data.length < 2) return null

  const chartData = data.map((v, i) => ({ i, v }))

  const config = {
    v: { label: "Value", color },
  } satisfies ChartConfig

  return (
    <ChartContainer
      config={config}
      className="!aspect-auto"
      style={{ width, height }}
    >
      <AreaChart
        data={chartData}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color.replace("#", "")})`}
          dot={false}
          isAnimationActive
          animationDuration={800}
        />
      </AreaChart>
    </ChartContainer>
  )
}
