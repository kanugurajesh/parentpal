/** The device's local calendar date as YYYY-MM-DD (the server's clock may be in another time zone). */
export function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A local Date for `isoDate` at hh:mm. */
export function atLocalTime(isoDate: string, hhmm: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

export function addDaysISO(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return localDateISO(new Date(y, m - 1, d + days));
}
