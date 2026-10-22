export type BookingLocation = 'shop' | 'field';

export const DEFAULT_URABLE_SHOP_URL = 'https://app.urable.com/virtual-shop/v2utxe9P5ebXGz1m9fXr';

export interface UrableBookingLinkOptions {
  location: BookingLocation;
  categoryId?: string;
  serviceId?: string;
  priceSku?: string;
}

export function buildUrableBookingUrl(baseUrl: string, options: UrableBookingLinkOptions): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'app.urable.com' || !url.pathname.startsWith('/virtual-shop/')) {
    throw new Error('Invalid Urable virtual-shop URL');
  }
  url.searchParams.set('industry', 'vehicleCare');
  url.searchParams.set('jobType', options.location);
  if (options.categoryId) url.searchParams.set('categoryId', options.categoryId);
  if (options.serviceId) url.searchParams.set('productServiceId', options.serviceId);
  if (options.priceSku) url.searchParams.set('sku', options.priceSku);
  return url.toString();
}
