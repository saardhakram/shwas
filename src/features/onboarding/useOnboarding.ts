import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  HealthFlags,
  ProfileFamilyMember,
  ProfileHome,
  ProfileLocation,
  UserProfile,
} from '../../types';
import { calculateFamilyExposure } from '../../lib/cigarettes';
import { fetchOpenMeteoForecast } from '../../lib/forecast';
import { buildEnrichedPlan, generateRuleBasedPlan } from '../../lib/planGenerator';
import { upsertProfile } from '../../lib/supabase';
import { STORAGE_KEYS, storage } from '../../lib/storage';
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

const DEFAULT_FAMILY: ProfileFamilyMember[] = [
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

const DEFAULT_HOME: ProfileHome = {
  windowsFacingRoad: true,
  purifier: true,
  chimney: true,
  cookingFuel: 'lpg',
  commuteMode: 'metro',
  windowsShut: true,
};

async function reverseGeocodePosition(latitude: number, longitude: number): Promise<string> {
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

function useRevealCalculation(
  step: number,
  language: string,
  location: ProfileLocation,
  family: ProfileFamilyMember[],
  home: ProfileHome,
) {
  const runKey = `${language}|${location.lat}|${location.lon}|${family.length}|${home.purifier}|${home.chimney}|${home.windowsFacingRoad}|${home.cookingFuel}`;
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const [outdoorPm25, setOutdoorPm25] = useState<number>(240);
  const [revealedCigarettes, setRevealedCigarettes] = useState<number>(9);
  const [targetCigarettes, setTargetCigarettes] = useState<number>(5);

  useEffect(() => {
    if (step !== 5) return;
    let active = true;

    fetchOpenMeteoForecast(location.lat, location.lon)
      .then((res) => {
        if (!active) return;
        const livePm25 = res.currentPm25 || 240;
        setOutdoorPm25(livePm25);

        const { perPersonAverage } = calculateFamilyExposure(family, livePm25, home, 'all');
        const previewProfile: UserProfile = { language, location, family, home };
        const previewPlan = buildEnrichedPlan(
          generateRuleBasedPlan(previewProfile, res.points),
          {},
          perPersonAverage,
        );
        const cappedSavings = Number(
          previewPlan.reduce((sum, item) => sum + item.cigarettesSaved, 0).toFixed(1),
        );
        const targetHero = Number(
          Math.max(0, Math.min(perPersonAverage, perPersonAverage - cappedSavings)).toFixed(1),
        );

        setRevealedCigarettes(perPersonAverage);
        setTargetCigarettes(targetHero);
      })
      .finally(() => {
        setTimeout(() => {
          if (active) setCompletedKey(runKey);
        }, 600);
      });

    return () => {
      active = false;
    };
  }, [step, runKey, language, location, home, family]);

  const isCalculating = step === 5 && completedKey !== runKey;
  return { isCalculating, outdoorPm25, revealedCigarettes, targetCigarettes };
}

async function searchIndianCities(query: string): Promise<ProfileLocation[]> {
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

export function useOnboarding() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<number>(1);
  const [language, setLanguage] = useState<string>(i18n.language || 'en');
  const [location, setLocation] = useState<ProfileLocation>(POPULAR_CITIES[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ProfileLocation[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const [family, setFamily] = useState<ProfileFamilyMember[]>(DEFAULT_FAMILY);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberAge, setNewMemberAge] = useState<number>(25);
  const [newMemberFlags, setNewMemberFlags] = useState<HealthFlags>({});
  const [home, setHome] = useState<ProfileHome>(DEFAULT_HOME);
  const [selectedMemberIdx, setSelectedMemberIdx] = useState<number>(0);

  const reveal = useRevealCalculation(step, language, location, family, home);

  const handleSelectLanguage = (code: string) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    storage.setItem(STORAGE_KEYS.LANGUAGE, code);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert(t('onboarding.geoUnsupported', 'Geolocation is not supported by your browser.'));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const name = await reverseGeocodePosition(latitude, longitude);
        setLocation({ lat: latitude, lon: longitude, name });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        alert(
          t(
            'onboarding.geoFailed',
            'Could not retrieve your location. Please choose a city below.',
          ),
        );
      },
      { timeout: 10000 },
    );
  };

  const handleSearchCity = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      setSearchResults(await searchIndianCities(searchQuery.trim()));
    } catch (err) {
      logger.warn('City search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;
    setFamily([
      ...family,
      {
        id: `member_${Date.now()}`,
        name: newMemberName.trim(),
        age: Number(newMemberAge) || 20,
        flags: newMemberFlags,
        routine: { hoursOutside: 2, hoursAway: 6, awayPlace: 'office' },
      },
    ]);
    setNewMemberName('');
    setNewMemberAge(25);
    setNewMemberFlags({});
  };

  const handleRemoveMember = (id: string) => {
    if (family.length <= 1) return;
    setFamily(family.filter((f) => f.id !== id));
    if (selectedMemberIdx >= family.length - 1) setSelectedMemberIdx(0);
  };

  const updateMemberRoutine = (
    memberIdx: number,
    field: 'hoursOutside' | 'hoursAway',
    value: number,
  ) => {
    setFamily((prev) =>
      prev.map((member, idx) =>
        idx === memberIdx ? { ...member, routine: { ...member.routine, [field]: value } } : member,
      ),
    );
  };

  const handleComplete = async () => {
    await upsertProfile({
      language,
      location,
      family,
      home,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    });
    navigate('/today');
  };

  return {
    step,
    setStep,
    language,
    handleSelectLanguage,
    location,
    setLocation,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    isLocating,
    handleUseMyLocation,
    handleSearchCity,
    family,
    newMemberName,
    setNewMemberName,
    newMemberAge,
    setNewMemberAge,
    newMemberFlags,
    setNewMemberFlags,
    handleAddMember,
    handleRemoveMember,
    home,
    setHome,
    selectedMemberIdx,
    setSelectedMemberIdx,
    updateMemberRoutine,
    ...reveal,
    handleComplete,
  };
}
