import type { ImageSourcePropType } from 'react-native';
const detail = require('../assets/brand/detail.jpg');
const ceramic = require('../assets/brand/ceramic.jpg');
const correction = require('../assets/brand/correction.jpg');
const interior = require('../assets/brand/interior.jpg');
const ppf = require('../assets/brand/ppf.jpg');
export function servicePhoto(name: string): ImageSourcePropType {
  const text=name.toLowerCase();
  if (text.includes('ceramic') || text.includes('coating')) return ceramic;
  if (text.includes('paint protection') || text.includes('ppf')) return ppf;
  if (text.includes('correction') || text.includes('polish')) return correction;
  if (text.includes('interior')) return interior;
  return detail;
}
