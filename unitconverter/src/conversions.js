/**
 * conversions.js
 * All unit conversion lookup tables and constants.
 */

/** Length — all values in metres */
export const LENGTH_TO_METRES = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
  nmi: 1852,       // nautical mile
};

/** Weight — all values in grams */
export const WEIGHT_TO_GRAMS = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  t: 1_000_000,   // metric tonne
  oz: 28.349523125,
  lb: 453.59237,
  st: 6350.29318,  // stone
  short_ton: 907184.74,
};

/**
 * Currency — fixed reference rates relative to USD (1 USD = X units).
 * Note: these are approximate and not live. Update periodically.
 */
export const CURRENCY_RATES_FROM_USD = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.50,
  CAD: 1.36,
  AUD: 1.53,
  CHF: 0.90,
  CNY: 7.24,
  INR: 83.10,
  MXN: 17.15,
  BRL: 4.97,
  KRW: 1325.00,
  SGD: 1.34,
  HKD: 7.82,
  NOK: 10.55,
  SEK: 10.42,
  DKK: 6.89,
  NZD: 1.63,
  ZAR: 18.63,
  AED: 3.67,
};

/** IANA timezone list (subset) for manifest documentation */
export const EXAMPLE_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
  'Pacific/Auckland', 'UTC',
];