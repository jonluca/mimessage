import { useMemo } from "react";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import { useEarliestMessageDate } from "../../hooks/dataHooks";

export const YearSelector = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const setWrappedYear = useMimessage((state) => state.setWrappedYear);

  const { data: earliestDate } = useEarliestMessageDate();

  const yearOptions = useMemo(() => {
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
  }, [earliestDate]);

  return (
    <div className="wrapped-year-selector">
      <select
        className="wrapped-year-select"
        value={wrappedYear}
        onChange={(event) => setWrappedYear(Number(event.currentTarget.value))}
        aria-label="Show Wrapped statistics for year"
      >
        {yearOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
