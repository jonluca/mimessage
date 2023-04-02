import { DateTime } from 'luxon';

export class QueryContextError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class QueryContext {
  start: number | null = null;
  end: number | null = null;

  static sanitizeDate(date: string): number | null {
    const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

    if (!formattedDate) {
      return null;
    }

    const dt = DateTime.fromISO(formattedDate, { zone: 'local' });

    if (!dt.isValid) {
      return null;
    }

    return dt.valueOf() * 1000;
  }

  setStart(start: string): QueryContextError | null {
    const timestamp = QueryContext.sanitizeDate(start);
    if (timestamp === null) {
      return new QueryContextError(`InvalidDate: ${start}`);
    }
    this.start = timestamp;
    return null;
  }

  setEnd(end: string): QueryContextError | null {
    const timestamp = QueryContext.sanitizeDate(end);
    if (timestamp === null) {
      return new QueryContextError(`InvalidDate: ${end}`);
    }
    this.end = timestamp;
    return null;
  }

  hasFilters(): boolean {
    return this.start !== null || this.end !== null;
  }

  generateFilterStatement(): string {
    let filters = '';

    if (this.start !== null) {
      filters += `    m.date >= ${this.start}`;
    }

    if (this.end !== null) {
      if (filters !== '') {
        filters += ' AND ';
      }
      filters += `    m.date <= ${this.end}`;
    }

    if (filters !== '') {
      return ` WHERE\n${filters}`;
    }

    return filters;
  }
}