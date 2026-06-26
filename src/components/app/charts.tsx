"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
);

const FONT = { family: "Outfit, sans-serif" };

type CartesianType = "bar" | "line";

function cartesianOptions<T extends CartesianType>(
  currency?: boolean,
): ChartOptions<T> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: FONT, boxWidth: 12 } },
      tooltip: { bodyFont: FONT, titleFont: FONT },
    },
    scales: {
      x: { ticks: { font: FONT }, grid: { display: false } },
      y: {
        ticks: {
          font: FONT,
          callback: currency
            ? (v: string | number) =>
                new Intl.NumberFormat("pt-BR", {
                  notation: "compact",
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 1,
                }).format(Number(v))
            : undefined,
        },
        grid: { color: "rgba(99,102,241,.08)" },
      },
    },
  } as unknown as ChartOptions<T>;
}

export function BarChart({
  data,
  height = 260,
  currency,
}: {
  data: ChartData<"bar">;
  height?: number;
  currency?: boolean;
}) {
  return (
    <div style={{ height }}>
      <Bar data={data} options={cartesianOptions<"bar">(currency)} />
    </div>
  );
}

export function LineChart({
  data,
  height = 260,
  currency,
}: {
  data: ChartData<"line">;
  height?: number;
  currency?: boolean;
}) {
  return (
    <div style={{ height }}>
      <Line data={data} options={cartesianOptions<"line">(currency)} />
    </div>
  );
}

export function DoughnutChart({
  data,
  height = 260,
}: {
  data: ChartData<"doughnut">;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Doughnut
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "right", labels: { font: FONT, boxWidth: 12 } } },
        }}
      />
    </div>
  );
}

/** Paleta alinhada aos tokens do app. */
export const CHART_COLORS = {
  indigo: "#6366f1",
  green: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  red: "#ef4444",
  violet: "#8b5cf6",
  pink: "#ec4899",
  teal: "#14b8a6",
};
