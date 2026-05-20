function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeFormat(d: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', options).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function parseISODate(iso: string): Date {
  const [y, m, day] = iso.split('-').map((p) => parseInt(p, 10));
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

export function frenchShortDate(iso: string): string {
  const d = parseISODate(iso);
  return capitalize(
    safeFormat(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''),
  );
}

export function frenchLongDate(iso: string): string {
  const d = parseISODate(iso);
  return capitalize(safeFormat(d, { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function frenchMonthYear(d: Date): string {
  return capitalize(safeFormat(d, { month: 'long', year: 'numeric' }));
}
