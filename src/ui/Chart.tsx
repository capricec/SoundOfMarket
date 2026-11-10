import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { MusicalState } from "../composition/types";
import type { Bar, SignalSettings, SymbolId } from "../market/types";
import type { RollingPoint } from "../market/rollingView";
import type { Marker } from "../playback";

const COLOR: Record<SymbolId, string> = {
  spy: "#e2b15c",
  tlt: "#d4724b",
  gld: "#7ea172",
  vix: "#d36b8a",
};

const META: { id: SymbolId; name: string; axis: number }[] = [
  { id: "spy", name: "SPY", axis: 0 },
  { id: "tlt", name: "TLT", axis: 1 },
  { id: "gld", name: "Gold", axis: 2 },
  { id: "vix", name: "VIX", axis: 3 },
];

/** Series that are currently changing the arrangement you hear. */
export function activeSeries(state: MusicalState): Record<SymbolId, boolean> {
  return {
    spy: state.cello !== "home",
    tlt: state.guitar !== "home",
    gld: state.bass !== "home",
    vix: state.percussion === "in" || state.percussion === "resolving",
  };
}

type Props = {
  bars: Bar[];
  rolling: RollingPoint[];
  playIndex: number;
  markers: Marker[];
  settings: SignalSettings;
  musical: MusicalState;
  playing?: boolean;
};

function hexAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Chart({ bars, rolling, playIndex, markers, settings, musical, playing = false }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!node.current) return;
    const instance = echarts.init(node.current, undefined, { renderer: "canvas" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || bars.length === 0) return;
    const dates = bars.map((bar) => bar.date);
    const safeIndex = Math.min(Math.max(0, playIndex), bars.length - 1);
    const playDate = dates[safeIndex];
    const active = activeSeries(musical);

    const eventMarks = markers.map((marker) => ({
      xAxis: marker.date,
      label: {
        formatter: marker.label,
        color: "#b7ab9a",
        fontSize: 10,
        rotate: 0,
        position: "insideEndTop" as const,
        distance: 8,
      },
      lineStyle: { color: "rgba(243,236,223,0.22)", type: "dashed" as const, width: 1 },
    }));

    const playhead = {
      xAxis: playDate,
      label: {
        show: true,
        formatter: playing ? "NOW" : "HERE",
        color: "#12100d",
        backgroundColor: "#f3ecdf",
        padding: [4, 8],
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        rotate: 0,
        position: "start" as const,
        distance: 10,
      },
      lineStyle: { color: "#f3ecdf", width: 2.5, type: "solid" as const, shadowBlur: 8, shadowColor: "rgba(243,236,223,0.45)" },
    };

    const priceSeries = META.map((meta, index) => {
      const on = active[meta.id];
      const color = on ? COLOR[meta.id] : hexAlpha(COLOR[meta.id], 0.5);
      return {
        name: meta.name,
        type: "line" as const,
        yAxisIndex: meta.axis,
        showSymbol: false,
        z: on ? 5 : 2,
        data: bars.map((bar) => bar[meta.id]),
        lineStyle: { width: on ? 3.2 : 1.5, color },
        itemStyle: { color },
        markPoint: {
          symbol: "circle",
          symbolSize: on ? 11 : 7,
          itemStyle: {
            color: on ? COLOR[meta.id] : hexAlpha(COLOR[meta.id], 0.5),
            borderColor: "#f3ecdf",
            borderWidth: on ? 2 : 1,
          },
          label: { show: false },
          data: [{ coord: [playDate, bars[safeIndex][meta.id]], name: "playhead" }],
        },
        markLine:
          index === 0
            ? {
                symbol: ["none", "none"],
                silent: true,
                animation: false,
                data: [playhead, ...eventMarks],
              }
            : undefined,
      };
    });

    const averageSeries = META.map((meta) => {
      const on = active[meta.id];
      const color = hexAlpha(COLOR[meta.id], on ? 0.55 : 0.28);
      return {
        name: `${meta.name} ${settings[meta.id].reference === "session" ? "prev" : settings[meta.id].reference === "bbands" ? "band" : `${settings[meta.id].window}d`}`,
        type: "line" as const,
        yAxisIndex: meta.axis,
        showSymbol: false,
        z: 1,
        data: rolling.map((point) => point[meta.id]),
        lineStyle: { width: on ? 1.6 : 1.1, type: "dashed" as const, color },
        itemStyle: { color },
      };
    });

    instance.setOption(
      {
        animation: false,
        backgroundColor: "transparent",
        legend: {
          type: "plain",
          textStyle: { color: "#d9d0c3", fontSize: 11 },
          top: 0,
          left: 8,
          right: 8,
          itemWidth: 14,
          itemGap: 12,
          data: [...priceSeries, ...averageSeries].map((series) => series.name),
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: "#2a241c",
          borderColor: "#4a4034",
          textStyle: { color: "#f3ecdf", fontSize: 12 },
        },
        grid: { left: 112, right: 108, top: 64, bottom: 28 },
        xAxis: {
          type: "category",
          data: dates,
          axisLabel: { color: "#b7ab9a", fontSize: 11 },
          axisLine: { lineStyle: { color: "#4a4034" } },
        },
        yAxis: META.map((meta) => ({
          type: "value" as const,
          position: meta.axis < 2 ? ("left" as const) : ("right" as const),
          offset: meta.axis % 2 === 1 ? 54 : 0,
          scale: true,
          axisLabel: {
            color: active[meta.id] ? COLOR[meta.id] : hexAlpha(COLOR[meta.id], 0.5),
            fontSize: 10,
            fontWeight: active[meta.id] ? 600 : 400,
          },
          splitLine: { show: meta.axis === 0, lineStyle: { color: "rgba(243,236,223,0.06)" } },
        })),
        series: [...priceSeries, ...averageSeries],
      },
      { notMerge: true },
    );
  }, [bars, rolling, playIndex, markers, settings, musical, playing]);

  return <div className="chart" ref={node} role="img" aria-label="Market lines with the playhead on the moment you are hearing" />;
}
