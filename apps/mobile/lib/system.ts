/** True when `current` (e.g. "1.0.0") is older than `minimum`. Blank or unparsable minimums never block. */
export function isOutdated(current: string, minimum?: string | null): boolean {
  const parse = (v: string) => /^\d+(\.\d+){0,2}$/.test(v.trim()) ? v.trim().split('.').map(Number) : null;
  const a = parse(current), b = minimum ? parse(minimum) : null;
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d < 0; }
  return false;
}

export type Gate = 'ok' | 'maintenance' | 'update';
/** Which blocking system screen (if any) applies. Maintenance wins over a forced update. */
export function gateFor(config: { minAppVersion?: string | null; maintenanceMessage?: string | null } | undefined, version: string): Gate {
  if (config?.maintenanceMessage?.trim()) return 'maintenance';
  return isOutdated(version, config?.minAppVersion) ? 'update' : 'ok';
}
