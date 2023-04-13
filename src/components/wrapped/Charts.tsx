import React from "react";
import type { AxisOptions } from "react-charts";
import type { Chart as ChartType } from "react-charts";
import dynamic from "next/dynamic";
import { useWrappedDates } from "../../hooks/dataHooks";
import { groupBy } from "lodash-es";
import type { UserSerie } from "react-charts/types/types";
import type { MessageDate } from "../../interfaces";
import { SECTION_HEIGHT, SECTION_WIDTH, SectionHeader, SectionWrapper } from "./Containers";
import Box from "@mui/material/Box";
import dayjs from "dayjs";
import { ErrorBoundary } from "../ErrorBoundary";
import type { MessageDates } from "../../interfaces";
const Chart = dynamic(() => import("react-charts").then((mod) => mod.Chart), {
  ssr: false,
}) as typeof ChartType;

const MessagesByBase = ({
  getDataCallback,
}: {
  getDataCallback: (dates: MessageDates | undefined) => UserSerie<{ primary: Date; secondary: number }>[];
}) => {
  const { data: dates } = useWrappedDates();

  const data = React.useMemo(() => {
    return getDataCallback(dates);
  }, [dates, getDataCallback]);

  return (
    <SectionWrapper sx={{ width: SECTION_WIDTH, height: SECTION_HEIGHT }}>
      <SectionHeader>Messages by Year</SectionHeader>
      <Box sx={{ width: "100%", height: "100%" }}>
        <ErrorBoundary>
          <BaseChart data={data} />
        </ErrorBoundary>
      </Box>
    </SectionWrapper>
  );
};
const getMessagesByYear = (dates: MessageDates | undefined) => {
  const grouped = groupBy(dates || [], (d: MessageDate) => {
    if (d.date_obj) {
      return d.date_obj.getFullYear();
    }
  });

  const datums = Object.entries(grouped)
    .filter((l) => l[0] !== "undefined")
    .map(([_, dates]) => ({
      primary: dayjs(dates[0].date_obj!).startOf("year").add(1, "d").toDate(),
      secondary: dates.length,
    }));
  return [
    {
      label: "Messages by Year",
      data: datums,
    },
  ];
};
export const MessagesByYear = () => {
  return <MessagesByBase getDataCallback={getMessagesByYear} />;
};

export const MessagesByMonth = () => {
  return <MessagesByBase getDataCallback={getMessagesByYear} />;
};
export const BaseChart = <T extends { primary: Date; secondary: number }>({ data }: { data: UserSerie<T>[] }) => {
  const primaryAxis = React.useMemo<AxisOptions<typeof data[number]["data"][number]>>(
    () => ({
      getValue: (datum) => datum.primary as Date,
      formatters: {
        cursor: (v: Date) => {
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
        scaleType: "linear",
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
