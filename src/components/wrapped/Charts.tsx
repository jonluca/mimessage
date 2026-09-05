import React from "react";
import { useHandleMap } from "../../hooks/dataHooks";
import { SectionHeader, SectionWrapper } from "./Containers";
import { ErrorBoundary } from "../ErrorBoundary";
import type { WrappedChartStats } from "../../interfaces";
import { WRAPPED_HOUR_LABELS, WRAPPED_MONTH_LABELS } from "../../utils/wrapped-chart-labels";

import type { ChartData, ChartOptions } from "chart.js";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const DARK_APPEARANCE_QUERY = "(prefers-color-scheme: dark)";

interface WrappedChartProps {
  stats: WrappedChartStats;
}

const subscribeToAppearance = (onStoreChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }

  const appearance = window.matchMedia(DARK_APPEARANCE_QUERY);
  appearance.addEventListener("change", onStoreChange);
  return () => appearance.removeEventListener("change", onStoreChange);
};

const getAppearanceSnapshot = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(DARK_APPEARANCE_QUERY).matches;
};

const getServerAppearanceSnapshot = () => false;

const getSemanticColor = (property: string, fallback: string) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.getComputedStyle(document.documentElement).getPropertyValue(property).trim() || fallback;
};

const MessagesByBase = ({
  data,
  emptyMessage = "No dated messages available.",
  title,
}: {
  data: ChartData<"bar"> | null;
  emptyMessage?: string;
  title: string;
}) => {
  const isDarkAppearance = React.useSyncExternalStore(
    subscribeToAppearance,
    getAppearanceSnapshot,
    getServerAppearanceSnapshot,
  );

  const themedData = React.useMemo(() => {
    if (!data) {
      return null;
    }

    const accentColor = getSemanticColor("--accent", isDarkAppearance ? "#0091ff" : "#0088ff");
    return {
      ...data,
      datasets: data.datasets.map((dataset) => ({
        ...dataset,
        backgroundColor: accentColor,
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 22,
      })),
    };
  }, [data, isDarkAppearance]);

  return (
    <SectionWrapper className="wrapped-chart-card">
      <SectionHeader>{title}</SectionHeader>
      <div className="wrapped-chart-canvas">
        <ErrorBoundary variant="section">
          {themedData ? (
            <BaseChart data={themedData} isDarkAppearance={isDarkAppearance} />
          ) : (
            <p className="wrapped-chart-empty">{emptyMessage}</p>
          )}
        </ErrorBoundary>
      </div>
    </SectionWrapper>
  );
};
export const MessagesByYear = ({ stats }: WrappedChartProps) => {
  const data = React.useMemo<ChartData<"bar"> | null>(() => {
    if (!stats.byYear.length) {
      return null;
    }
    return {
      labels: stats.byYear.map((datum) => datum.year),
      datasets: [{ label: "Messages by Year", data: stats.byYear.map((datum) => datum.count) }],
    };
  }, [stats.byYear]);
  return <MessagesByBase title="Messages by Year" data={data} />;
};

export const MessagesByMonth = ({ stats }: WrappedChartProps) => {
  const data = React.useMemo<ChartData<"bar"> | null>(() => {
    if (!stats.byMonth.some((count) => count > 0)) {
      return null;
    }
    return {
      labels: WRAPPED_MONTH_LABELS,
      datasets: [{ label: "Messages by Month", data: stats.byMonth }],
    };
  }, [stats.byMonth]);
  return <MessagesByBase title="Messages by Month" data={data} />;
};

export const MessagesByHour = ({ stats }: WrappedChartProps) => {
  const data = React.useMemo<ChartData<"bar"> | null>(() => {
    if (!stats.byHour.some((count) => count > 0)) {
      return null;
    }
    return {
      labels: WRAPPED_HOUR_LABELS,
      datasets: [{ label: "Messages by Hour", data: stats.byHour }],
    };
  }, [stats.byHour]);
  return <MessagesByBase title="Messages by Hour" data={data} />;
};

export const MessagesByPerson = ({ stats }: WrappedChartProps) => {
  const handleMap = useHandleMap();
  const data = React.useMemo<ChartData<"bar"> | null>(() => {
    const people = new Map<string, { count: number; label: string }>();
    for (const datum of stats.byHandle) {
      const handle = handleMap[datum.handleId];
      const identity =
        datum.handleId === 0
          ? "you"
          : handle?.contact?.identifier
            ? `contact:${handle.contact.identifier}`
            : `handle:${datum.handleId}`;
      const label = datum.handleId === 0 ? "You" : handle?.contact?.parsedName || handle?.id || String(datum.handleId);
      const existing = people.get(identity);
      if (existing) {
        existing.count += datum.count;
      } else {
        people.set(identity, { count: datum.count, label });
      }
    }

    const sorted = Array.from(people.values()).sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label),
    );
    if (!sorted.length) {
      return null;
    }
    return {
      labels: sorted.map((person) => person.label),
      datasets: [{ label: "Messages by Person", data: sorted.map((person) => person.count) }],
    };
  }, [handleMap, stats.byHandle]);
  return <MessagesByBase title="Messages by Person" data={data} emptyMessage="No participant messages available." />;
};
const createChartOptions = (isDarkAppearance: boolean): ChartOptions<"bar"> => {
  const primaryLabelFallback = isDarkAppearance ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 0.85)";
  const secondaryLabelFallback = isDarkAppearance ? "rgba(255, 255, 255, 0.56)" : "rgba(60, 60, 67, 0.6)";
  const popoverFallback = isDarkAppearance ? "rgba(49, 49, 49, 0.97)" : "rgba(246, 246, 246, 0.96)";
  const tickStyles = {
    color: getSemanticColor("--label-secondary", secondaryLabelFallback),
    font: {
      family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      size: 11,
      weight: 400 as const,
    },
    padding: 7,
  };

  return {
    responsive: true,
    animation: {
      duration: 180,
    },
    layout: {
      padding: {
        top: 3,
        right: 3,
      },
    },
    plugins: {
      legend: {
        position: "top",
        display: false,
      },
      tooltip: {
        backgroundColor: getSemanticColor("--popover-background", popoverFallback),
        bodyColor: getSemanticColor("--label-primary", primaryLabelFallback),
        titleColor: getSemanticColor("--label-primary", primaryLabelFallback),
        borderColor: getSemanticColor("--separator", "rgba(60, 60, 67, 0.16)"),
        borderWidth: 1,
        cornerRadius: 7,
        displayColors: false,
        padding: 8,
      },
    },
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        border: {
          display: false,
        },
        grid: {
          color: getSemanticColor("--separator", "rgba(60, 60, 67, 0.16)"),
          drawTicks: false,
        },
        ticks: {
          ...tickStyles,
          maxTicksLimit: 5,
          precision: 0,
        },
      },
      x: {
        border: {
          display: false,
        },
        grid: {
          display: false,
        },
        ticks: {
          ...tickStyles,
          maxRotation: 0,
          minRotation: 0,
        },
      },
    },
  };
};

export const BaseChart = ({ data, isDarkAppearance }: { data: ChartData<"bar">; isDarkAppearance?: boolean }) => {
  const options = React.useMemo(() => createChartOptions(Boolean(isDarkAppearance)), [isDarkAppearance]);

  return (
    <ErrorBoundary variant="section">
      <Bar data={data} options={options} />
    </ErrorBoundary>
  );
};
