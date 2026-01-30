"use client";

import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ChartDataItem {
  name: string;
  value: number;
  color: string;
  chainId: number;
  transactions: number;
  moduleTransactions: number;
}

interface ProcessedChartItem {
  name: string;
  value: number;
  color: string;
  isOther?: boolean;
  otherItems?: { name: string; value: number; percent: string }[];
}

interface NetworkPieChartProps {
  data: ChartDataItem[];
}

// Custom tooltip for the "Others" slice
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ProcessedChartItem }[] }) {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  
  if (data.isOther && data.otherItems) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg max-h-64 overflow-y-auto">
        <p className="font-medium mb-2 text-foreground">Others ({data.value.toLocaleString()} Safes)</p>
        <div className="space-y-1 text-sm">
          {data.otherItems.map((item, idx) => (
            <div key={idx} className="flex justify-between gap-4 text-muted-foreground">
              <span>{item.name}</span>
              <span>{item.value.toLocaleString()} ({item.percent})</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">{data.value.toLocaleString()} Safes</p>
    </div>
  );
}

export function NetworkPieChart({ data }: NetworkPieChartProps) {
  // Filter out chains with 0 safes
  const filteredData = data.filter(d => d.value > 0);
  const total = filteredData.reduce((acc, d) => acc + d.value, 0);
  
  // Separate items >= 1% and < 1%
  const majorItems: ProcessedChartItem[] = [];
  const minorItems: { name: string; value: number; percent: string }[] = [];
  
  filteredData.forEach(item => {
    const percent = total > 0 ? (item.value / total) * 100 : 0;
    if (percent >= 1) {
      majorItems.push({
        name: item.name,
        value: item.value,
        color: item.color,
      });
    } else {
      minorItems.push({
        name: item.name,
        value: item.value,
        percent: `${percent.toFixed(2)}%`,
      });
    }
  });
  
  // Add "Others" slice if there are minor items
  if (minorItems.length > 0) {
    const othersValue = minorItems.reduce((acc, item) => acc + item.value, 0);
    majorItems.push({
      name: "Others",
      value: othersValue,
      color: "#6B7280", // Gray color for Others
      isOther: true,
      otherItems: minorItems.sort((a, b) => b.value - a.value),
    });
  }
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPie>
        <Pie
          data={majorItems}
          cx="50%"
          cy="50%"
          innerRadius={80}
          outerRadius={140}
          paddingAngle={2}
          dataKey="value"
          label={(props) => {
            const name = props.name as string | undefined;
            const percent = props.percent as number | undefined;
            return (percent ?? 0) > 0.03 ? `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%` : "";
          }}
          labelLine={false}
        >
          {majorItems.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </RechartsPie>
    </ResponsiveContainer>
  );
}
