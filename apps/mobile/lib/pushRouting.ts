const SCREENS = new Set(['/rewards', '/bookings', '/protection', '/gallery', '/shop', '/services', '/vehicles', '/notifications']);

/**
 * Map a push `deepLink` (server contract) to an app route. Only known shapes are followed, so a
 * crafted notification cannot navigate to an arbitrary screen. Null means "ignore the tap".
 */
export function routeForDeepLink(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const booking = /^\/bookings\/([A-Za-z0-9_-]{1,100})$/.exec(link);
  if (booking) return `/booking-detail?id=${booking[1]}`;
  const review = /^\/review\/([A-Za-z0-9_-]{1,100})$/.exec(link);
  if (review) return `/review?id=${review[1]}`;
  return SCREENS.has(link) ? link : null;
}
