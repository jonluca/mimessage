import Box from "@mui/material/Box";
import type { ChangeEvent } from "react";
import React from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import Calendar from "react-calendar";
import Popover from "@mui/material/Popover";
import { useChatDateRange } from "../hooks/dataHooks";

const isNullOrUndefined = (value: any): value is null | undefined => value === null || value === undefined;
const renderDifferenceStr = (diff: number | undefined | null, actualDate: Dayjs | null | undefined) => {
  if (isNullOrUndefined(diff) || isNullOrUndefined(actualDate) || Number.isNaN(diff)) {
    return "Loading...";
  }
  if (diff > -60) {
    return dayjs.duration(diff, "minutes").humanize(true);
  }

  return actualDate?.tz(dayjs.tz.guess()).format("MMM D h:mm A");
};

export const DatePickerComponent = ({
  open,
  anchorEl,
  setOpen,
  date,
  onDateSelection,
}: {
  open: boolean;
  setOpen: (newVal: boolean) => void;
  anchorEl: Element | null;
  date: Date | null | undefined;
  onDateSelection: (value: Date, event: ChangeEvent<HTMLInputElement>) => void;
}) => {
  const { data } = useChatDateRange();
  return (
    <Popover
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left",
      }}
      open={open}
      onClose={() => setOpen(false)}
      anchorEl={anchorEl}
    >
      <Box sx={{ display: "flex" }}>
        <Calendar
          value={date}
          onChange={onDateSelection as any}
          maxDate={data?.max || undefined}
          minDate={data?.min || undefined}
        />
      </Box>
    </Popover>
  );
};
