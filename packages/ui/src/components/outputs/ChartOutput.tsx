import { useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

interface ChartConfig {
  chartType: "bar" | "line" | "pie" | "scatter" | "doughnut";
  xKey?: string;
  yKey?: string;
  label?: string;
  title?: string;
}

interface Props {
  data: unknown[];
  config: ChartConfig;
}

export function ChartOutput({ data, config }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    let labels: string[];
    let values: number[];

    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      // Array of objects: use xKey and yKey
      const rows = data as Record<string, unknown>[];
      const xKey = config.xKey || Object.keys(rows[0]!)[0];
      const yKey = config.yKey || Object.keys(rows[0]!)[1];
      labels = rows.map((r) => String(r[xKey!] ?? ""));
      values = rows.map((r) => Number(r[yKey!] ?? 0));
    } else {
      // Simple array of values
      labels = data.map((_, i) => String(i));
      values = data.map((v) => Number(v));
    }

    const bgColors = [
      "rgba(193, 95, 60, 0.7)",
      "rgba(43, 108, 176, 0.7)",
      "rgba(61, 140, 92, 0.7)",
      "rgba(197, 48, 48, 0.7)",
      "rgba(128, 90, 213, 0.7)",
      "rgba(214, 158, 46, 0.7)",
      "rgba(56, 178, 172, 0.7)",
      "rgba(237, 137, 54, 0.7)",
    ];

    const isPie = config.chartType === "pie" || config.chartType === "doughnut";

    chartRef.current = new Chart(ctx, {
      type: config.chartType,
      data: {
        labels,
        datasets: [{
          label: config.label || "Data",
          data: values,
          backgroundColor: isPie
            ? values.map((_, i) => bgColors[i % bgColors.length])
            : bgColors[0],
          borderColor: isPie
            ? values.map((_, i) => bgColors[i % bgColors.length]!.replace("0.7", "1"))
            : bgColors[0]!.replace("0.7", "1"),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: config.title ? { display: true, text: config.title } : { display: false },
          legend: { display: isPie },
        },
        scales: isPie ? {} : {
          y: { beginAtZero: true },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data, config]);

  return (
    <div className="chart-output" style={{ height: 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
