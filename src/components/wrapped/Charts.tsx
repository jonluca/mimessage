import React from "react";
import { useWrappedDates } from "../../hooks/dataHooks";
import { groupBy } from "lodash-es";
import type { MessageDate } from "../../interfaces";
import { CHART_HEIGHT, SECTION_WIDTH, SectionHeader, SectionWrapper } from "./Containers";
import Box from "@mui/material/Box";
import dayjs from "dayjs";
import { ErrorBoundary } from "../ErrorBoundary";
import type { MessageDates } from "../../interfaces";

import type { ChartData, ChartOptions } from "chart.js";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const MessagesByBase = ({
  getDataCallback,
  title,
}: {
  getDataCallback: (dates: MessageDates | undefined) => ChartData<"bar"> | null;
  title: string;
}) => {
  const { data: dates } = useWrappedDates();

  const data = React.useMemo(() => {
    const series = getDataCallback(dates);
    return series;
  }, [dates, getDataCallback]);

  return (
    <SectionWrapper sx={{ width: SECTION_WIDTH, height: CHART_HEIGHT }}>
      <SectionHeader>{title}</SectionHeader>
      <Box sx={{ width: "100%", height: "90%" }}>
        <ErrorBoundary>{data && <BaseChart data={data} />}</ErrorBoundary>
      </Box>
    </SectionWrapper>
  );
};
const getMessagesByYear = (dates: MessageDates | undefined): ChartData<"bar"> | null => {
  const grouped = groupBy(dates || [], (d: MessageDate) => {
    if (d.date_obj) {
      return d.date_obj.getFullYear();
    }
  });

  const datums = Object.entries(grouped)
    .filter((l) => l[0] !== "undefined")
    .map(([_, dates]) => {
      const startOfYear = dayjs(dates[0].date_obj!).startOf("year");
      const primary = startOfYear.add(1, "M").toDate();
      return {
        primary,
        secondary: dates.length,
      };
    })
    .filter((l) => l.primary);
  if (!datums) {
    return null;
  }

  return {
    labels: datums.map((l) => l.primary.getUTCFullYear()),
    datasets: [{ label: "Messages by Year", data: datums.map((l) => l.secondary), backgroundColor: "#5871f5" }],
  };
};

const getMessagesByMonth = (dates: MessageDates | undefined): ChartData<"bar"> | null => {
  const grouped = groupBy(dates || [], (d: MessageDate) => {
    if (d.date_obj) {
      return d.date_obj.getMonth();
    }
  });

  const datums = Object.entries(grouped)
    .filter((l) => l[0] !== "undefined")
    .map(([month, dates]) => ({
      primary: month,
      secondary: dates.length,
    }))
    .filter((l) => l.primary);

  // add missing months
  for (let i = 0; i < 12; i++) {
    if (!datums.find((d) => Number(d.primary) === i)) {
      datums.push({
        primary: String(i),
        secondary: 0,
      });
    }
  }
  // sort by month
  datums.sort((a, b) => {
    return Number(a.primary) - Number(b.primary);
  });

  for (const d of datums) {
    // map month number to month name
    d.primary = dayjs().month(Number(d.primary)).format("MMMM");
  }
  if (!datums) {
    return null;
  }

  return {
    labels: datums.map((l) => l.primary),
    datasets: [{ label: "Messages by Month", data: datums.map((l) => l.secondary), backgroundColor: "#5871f5" }],
  };
};

const getMessagesByHour = (dates: MessageDates | undefined): ChartData<"bar"> | null => {
  const grouped = groupBy(dates || [], (d: MessageDate) => {
    if (d.date_obj) {
      return d.date_obj.getHours();
    }
  });

  const datums = Object.entries(grouped)
    .filter((l) => l[0] !== "undefined")
    .map(([hour, dates]) => ({
      primary: hour,
      secondary: dates.length,
    }))
    .filter((l) => l.primary);

  // add missing hours
  for (let i = 0; i < 24; i++) {
    if (!datums.find((d) => Number(d.primary) === i)) {
      datums.push({
        primary: String(i),
        secondary: 0,
      });
    }
  }
  // sort by hour
  datums.sort((a, b) => {
    return Number(a.primary) - Number(b.primary);
  });

  for (const d of datums) {
    // map month number to hour name
    d.primary = dayjs().hour(Number(d.primary)).format("H A");
  }
  if (!datums) {
    return null;
  }
  return {
    labels: datums.map((l) => l.primary),
    datasets: [{ label: "Messages by Hour", data: datums.map((l) => l.secondary), backgroundColor: "#5871f5" }],
  };
};

const getMessagesByPerson = (dates: MessageDates | undefined): ChartData<"bar"> | null => {
  const grouped = groupBy(dates || [], (d: MessageDate) => {
    if (d.handle_id) {
      return d.handle_id;
    }
  });

  const datums = Object.entries(grouped)
    .filter((l) => l[0] !== "undefined")
    .map(([handle, dates]) => ({
      primary: handle,
      secondary: dates.length,
    }))
    .filter((l) => l.primary);

  if (!datums) {
    return null;
  }
  return {
    labels: datums.map((l) => l.primary),
    datasets: [{ label: "Messages by Hour", data: datums.map((l) => l.secondary), backgroundColor: "#5871f5" }],
  };
};
export const MessagesByYear = () => {
  return <MessagesByBase title={"Messages by Year"} getDataCallback={getMessagesByYear} />;
};

export const MessagesByMonth = () => {
  return <MessagesByBase title={"Messages by Month"} getDataCallback={getMessagesByMonth} />;
};
export const MessagesByHour = () => {
  return <MessagesByBase title={"Messages by Hour"} getDataCallback={getMessagesByHour} />;
};

export const MessagesByPerson = () => {
  return <MessagesByBase title={"Messages by Person"} getDataCallback={getMessagesByPerson} />;
};
const axisStyles = {
  ticks: {
    color: "white",
    beginAtZero: true,
  },
  grid: {
    color: "#464646",
  },
};
const options = {
  responsive: true,
  plugins: {
    legend: {
      position: "top" as const,
      display: false,
    },
  },
  maintainAspectRatio: false,
  scales: {
    y: axisStyles,
    x: axisStyles,
  },
} as ChartOptions<"bar">;
export const BaseChart = ({ data }: { data: ChartData<"bar"> }) => {
  return (
    <ErrorBoundary>
      <Bar data={data} options={options} />
    </ErrorBoundary>
  );
};
