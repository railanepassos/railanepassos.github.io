export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "17:00";
/** Brazil (America/Sao_Paulo) has no DST since 2019. */
export const SCHEDULE_OFFSET = "-03:00";
export const SCHEDULE_TZID = "America/Sao_Paulo";

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export function buildScheduleIso(dateYmd: string, timeHm: string): string {
  const date = dateYmd.trim();
  const time = timeHm.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("invalid date");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("invalid time");
  }
  return `${date}T${time}:00${SCHEDULE_OFFSET}`;
}

export function validateScheduleRange(
  startIso: string,
  endIso: string
): string | null {
  if (!startIso.trim() || !endIso.trim()) {
    return "Informe data e horários.";
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "Data ou horário inválido.";
  }
  if (end <= start) {
    return "O fim deve ser depois do início.";
  }
  return null;
}

export function splitScheduleLocal(iso: string): { date: string; time: string } {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) throw new Error("invalid schedule iso");
  return { date: m[1], time: m[2] };
}

function parts(iso: string): {
  day: number;
  monthIdx: number;
  year: number;
  hour: number;
  minute: number;
} {
  const { date, time } = splitScheduleLocal(iso);
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return { day: d, monthIdx: mo - 1, year: y, hour: h, minute: mi };
}

function hourLabel(h: number): string {
  return String(h);
}

function padMinute(m: number): string {
  return String(m).padStart(2, "0");
}

function timeChipLabel(h: number, m: number): string {
  if (m === 0) return hourLabel(h);
  return `${h}:${padMinute(m)}`;
}

export function formatScheduleChip(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);
  return `${s.day} ${MONTHS_PT[s.monthIdx]} · ${timeChipLabel(s.hour, s.minute)}–${timeChipLabel(e.hour, e.minute)}`;
}

export function formatScheduleLabel(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${s.day} ${MONTHS_PT[s.monthIdx]} ${s.year} · ${pad(s.hour)}:${pad(s.minute)}–${pad(e.hour)}:${pad(e.minute)}`;
}
