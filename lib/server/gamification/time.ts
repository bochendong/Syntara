import { APP_TIME_ZONE } from '@/lib/server/gamification/config';

export function getDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');

  return { year, month, day };
}

export function dateKeyFromDate(date = new Date()): string {
  const { year, month, day } = getDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateFromDateKey(dateKey: string): Date {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDays(dateKey: string, offset: number): string {
  const base = dateFromDateKey(dateKey);
  base.setUTCDate(base.getUTCDate() + offset);
  return dateKeyFromDate(base);
}

export function dayDiff(from: Date, to: Date): number {
  const fromUtc = dateFromDateKey(dateKeyFromDate(from)).getTime();
  const toUtc = dateFromDateKey(dateKeyFromDate(to)).getTime();
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function currentWeekKey(date = new Date()): string {
  const key = dateKeyFromDate(date);
  const localDate = dateFromDateKey(key);
  const day = localDate.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const mondayKey = addDays(key, mondayOffset);
  return `week:${mondayKey}`;
}

export function startOfTodayUtc(): Date {
  return dateFromDateKey(dateKeyFromDate(new Date()));
}
