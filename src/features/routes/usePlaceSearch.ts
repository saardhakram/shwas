import { useState } from 'react';
import { searchPlaces, type PlaceSuggestion } from '../../lib/routingService';

export function usePlaceSearch(
  quickPresets: { home: PlaceSuggestion; school: PlaceSuggestion; office: PlaceSuggestion },
  savedHome: { lat: number; lon: number },
  useGoogle: boolean,
) {
  const [originOverride, setOriginOverride] = useState<PlaceSuggestion | null>(null);
  const [originInputOverride, setOriginInputOverride] = useState<string | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destination, setDestination] = useState<PlaceSuggestion | null>(quickPresets.office);
  const [destInput, setDestInput] = useState<string>(quickPresets.office.name);
  const [destSuggestions, setDestSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingTo, setIsSearchingTo] = useState<boolean>(false);

  const origin = originOverride ?? quickPresets.home;
  const originInput = originInputOverride ?? quickPresets.home.name;

  const handleDestSearch = async (query: string) => {
    setDestInput(query);
    if (query.trim().length < 2) return setDestSuggestions([]);
    setIsSearchingTo(true);
    setDestSuggestions(await searchPlaces(query, { lat: origin.lat, lon: origin.lon }, useGoogle));
    setIsSearchingTo(false);
  };

  const handleOriginSearch = async (query: string) => {
    setOriginInputOverride(query);
    if (query.trim().length < 2) return setOriginSuggestions([]);
    setOriginSuggestions(
      await searchPlaces(query, { lat: savedHome.lat, lon: savedHome.lon }, useGoogle),
    );
  };

  const handleChipClick = (chip: 'home' | 'school' | 'office') => {
    if (chip === 'home') {
      setOriginOverride(null);
      setOriginInputOverride(null);
      setOriginSuggestions([]);
      return;
    }
    const target = quickPresets[chip];
    setDestination(target);
    setDestInput(target.name);
    setDestSuggestions([]);
  };

  return {
    origin,
    setOrigin: setOriginOverride,
    originInput,
    setOriginInput: setOriginInputOverride,
    originSuggestions,
    setOriginSuggestions,
    destination,
    setDestination,
    destInput,
    setDestInput,
    destSuggestions,
    setDestSuggestions,
    isSearchingTo,
    handleDestSearch,
    handleOriginSearch,
    handleChipClick,
  };
}
