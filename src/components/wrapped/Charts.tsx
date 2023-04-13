import React from "react";
import type { AxisOptions } from "react-charts";
import type { Chart as ChartType } from "react-charts";
import dynamic from "next/dynamic";
import { useWrappedDates } from "../../hooks/dataHooks";
import { groupBy } from "lodash-es";
import type { UserSerie } from "react-charts/types/types";
import type { MessageDate } from "../../interfaces";
import { SectionHeader, SectionWrapper } from "./Containers";
import Box from "@mui/material/Box";
import { ErrorBoundary } from "../ErrorBoundary";
const Chart = dynamic(() => import("react-charts").then((mod) => mod.Chart), {
  ssr: false,
}) as typeof ChartType;

export const MessagesByYear = () => {
  const { data: dates } = useWrappedDates();

  const data = React.useMemo(() => {
    const grouped = groupBy(dates || [], (d: MessageDate) => {
      if (d.date_obj) {
        return d.date_obj.getFullYear();
      }
    });

    const datums = Object.entries(grouped)
      .filter((l) => l[0] !== "undefined")
      .map(([year, dates]) => ({
        primary: dates[0].date_obj!,
        secondary: dates.length,
      }));
    return [
      {
        label: "Messages by Year",
        data: datums,
      },
    ];
  }, [dates]);

  return (
    <SectionWrapper sx={{ width: 550, height: 250 }}>
      <SectionHeader>Messages by Year</SectionHeader>
      <Box sx={{ width: "100%", height: "100%" }}>
        <BaseChart data={data} />
      </Box>
    </SectionWrapper>
  );
};
export const BaseChart = <T extends { primary: Date; secondary: number }>({ data }: { data: UserSerie<T>[] }) => {
  const primaryAxis = React.useMemo<AxisOptions<typeof data[number]["data"][number]>>(
    () => ({
      getValue: (datum) => datum.primary as Date,
      formatters: {
        scale: (v: Date) => {
          return v?.getFullYear().toString();
        },
      },
      scaleType: "time",
    }),
    [],
  );

  const secondaryAxes = React.useMemo<AxisOptions<typeof data[number]["data"][number]>[]>(
    () => [
      {
        getValue: (datum) => datum.secondary,
        elementType: "bar",
      },
    ],
    [],
  );

  return (
    <ErrorBoundary>
      <Chart
        options={{
          data,
          primaryAxis,
          secondaryAxes,
          dark: true,
        }}
      />
    </ErrorBoundary>
  );
};
