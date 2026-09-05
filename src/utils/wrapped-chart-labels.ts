export const WRAPPED_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const formatWrappedHourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

export const WRAPPED_HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => formatWrappedHourLabel(hour));
