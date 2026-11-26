import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileLocation } from '../../types';
import { logger } from '../../lib/logger';
import { POPULAR_CITIES, reverseGeocodePosition, searchIndianCities } from './onboardingDefaults';

export function useLocationStep() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<ProfileLocation>(POPULAR_CITIES[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ProfileLocation[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);

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

  return {
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
  };
}
