import moment from "moment";

const TIMESTAMP_FACTOR = 1000000000;
const SEPARATOR = ", ";

export function getOffset(): number {
  return moment().year(2001).month(0).date(1).hour(0).minute(0).second(0).valueOf();
}

export function format(date: moment.Moment | Error): string {
  if (date instanceof Error) {
    return date.message;
  }
  return date.format("MMM D, YYYY h:mm:ss A");
}

export function readableDiff(
  start: moment.Moment | Error,
  end: moment.Moment | Error
): string | null {
  if (start instanceof Error || end instanceof Error) {
    return null;
  }
  const diff = end.diff(start);
  const duration = moment.duration(diff > 0 ? diff : 0);

  if (diff < 0) {
    return null;
  }

  const days = duration.days();
  const hours = duration.hours();
  const minutes = duration.minutes();
  const seconds = duration.seconds();

  const parts = [];
  if (days !== 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }
  if (hours !== 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  }
  if (minutes !== 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }
  if (seconds !== 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }

  return parts.join(SEPARATOR);
}