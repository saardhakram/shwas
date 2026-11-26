import type { ProfileFamilyMember, ProfileHome, ProfileLocation } from '../../types';
import { logger } from '../../lib/logger';

export const POPULAR_CITIES: ProfileLocation[] = [
  { name: 'Delhi NCR', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { name: 'Patna', lat: 25.5941, lon: 85.1376 },
];

export const LANGUAGE_TILES = [
  { code: 'en', native: 'English', subtitle: 'English' },
  { code: 'hi', native: 'हिंदी', subtitle: 'Hindi' },
  { code: 'te', native: 'తెలుగు', subtitle: 'Telugu' },
  { code: 'ta', native: 'தமிழ்', subtitle: 'Tamil' },
  { code: 'bn', native: 'বাংলা', subtitle: 'Bengali' },
  { code: 'mr', native: 'मराठी', subtitle: 'Marathi' },
];

export const DEFAULT_FAMILY: ProfileFamilyMember[] = [
  {
    id: 'me',
    name: 'Me',
    age: 32,
    flags: {},
    routine: { hoursOutside: 2, hoursAway: 8, awayPlace: 'office' },
  },
  {
    id: 'grandpa',
    name: 'Grandpa',
    age: 72,
    flags: { heart: true },
    routine: { hoursOutside: 1, hoursAway: 0, awayPlace: 'none' },
  },
  {
    id: 'child',
    name: 'Aarav',
    age: 8,
    flags: { asthma: true },
    routine: { hoursOutside: 1.5, hoursAway: 6, awayPlace: 'school' },
  },
];

export const DEFAULT_HOME: ProfileHome = {
  windowsFacingRoad: true,
  purifier: true,
  chimney: true,
  cookingFuel: 'lpg',
  commuteMode: 'metro',
  windowsShut: true,
};

export async function reverseGeocodePosition(latitude: number, longitude: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
    );
    if (!res.ok) return 'Current Location';
    const data = await res.json();
    return (
      data.address?.city ||
      data.address?.town ||
      data.address?.suburb ||
      data.address?.state_district ||
      'My Location'
    );
  } catch (err) {
    logger.warn('[Onboarding] Reverse geocode failed, using fallback label:', err);
    return 'Current Location';
  }
}

export async function searchIndianCities(query: string): Promise<ProfileLocation[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query,
    )}&countrycodes=in&limit=5`,
  );
  if (!res.ok) return [];
  const list = (await res.json()) as Array<{
    display_name?: string;
    lat: string;
    lon: string;
  }>;
  return list.map((item) => ({
    name: (item.display_name || '').split(',')[0],
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
  }));
}
