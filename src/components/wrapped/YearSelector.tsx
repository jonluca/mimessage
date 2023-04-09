import * as React from "react";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import { useEarliestMessageDate } from "../../hooks/dataHooks";
import type { Theme } from "react-select";
import Select from "react-select";
import Box from "@mui/material/Box";
import { SEARCH_BAR_HEIGHT } from "../chat-list/SearchBox";
const colors = {
  primary: "#2684FF",
  primary75: "#4C9AFF",
  primary50: "#484848",
  primary25: "#6b6b6b",

  danger: "#DE350B",
  dangerLight: "#FFBDAD",

  neutral90: "hsl(0, 0%, 100%)",
  neutral80: "hsl(0, 0%, 95%)",
  neutral70: "hsl(0, 0%, 90%)",
  neutral60: "hsl(0, 0%, 80%)",
  neutral50: "hsl(0, 0%, 70%)",
  neutral40: "hsl(0, 0%, 60%)",
  neutral30: "hsl(0, 0%, 50%)",
  neutral20: "hsl(0, 0%, 40%)",
  neutral10: "hsl(0, 0%, 30%)",
  neutral5: "hsl(0, 0%, 20%)",
  neutral0: "#1e1e1e",
};

const borderRadius = 4;
// Used to calculate consistent margin/padding on elements
const baseUnit = 4;
// The minimum height of the control
const controlHeight = SEARCH_BAR_HEIGHT;
// The amount of space between the control and menu */
const menuGutter = baseUnit * 2;

export const spacing = {
  baseUnit,
  controlHeight,
  menuGutter,
};

const theme: Theme = {
  borderRadius,
  colors,
  spacing,
};
export const YearSelector = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const setWrappedYear = useMimessage((state) => state.setWrappedYear);

  const { data: earliestDate } = useEarliestMessageDate();

  const yearOptions = React.useMemo(() => {
    const earliestYear = earliestDate?.getFullYear() ?? 2020;
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= earliestYear; i--) {
      years.push(i);
    }
    const sortedYears = years.sort().reverse();
    return [
      { value: WRAPPED_ALL_TIME_YEAR, label: "All Time" },
      ...sortedYears.map((year) => ({ value: year, label: year.toString() })),
    ];
  }, []);

  return (
    <Box sx={{ m: 1.25 }}>
      <Select<{ value: number; label: string }>
        value={yearOptions.find((option) => option.value === wrappedYear)}
        options={yearOptions}
        onChange={(newVal) => newVal && setWrappedYear(newVal.value)}
        theme={theme}
        blurInputOnSelect
        styles={{
          option: (baseStyles, state) => ({
            ...baseStyles,
            color: state.isSelected ? "white" : baseStyles.color,
          }),
        }}
      />
    </Box>
  );
};
