import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wind,
  MapPin,
  Search,
  Navigation,
  User,
  Plus,
  Trash2,
  HeartPulse,
  Baby,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Cigarette,
  Home,
  Clock,
  Check,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import {
  UserProfile,
  ProfileFamilyMember,
  ProfileLocation,
  ProfileHome,
  HealthFlags,
} from '../types';
import { calculateMemberDailyCigarettes, calculateFamilyExposure } from '../lib/cigarettes';
import { fetchOpenMeteoForecast } from '../lib/forecast';
import { generateRuleBasedPlan, buildEnrichedPlan } from '../lib/planGenerator';
import { upsertProfile } from '../lib/supabase';

const POPULAR_CITIES: ProfileLocation[] = [
  { name: 'Delhi NCR', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { name: 'Patna', lat: 25.5941, lon: 85.1376 },
];

const LANGUAGE_TILES = [
  { code: 'en', native: 'English', subtitle: 'English' },
  { code: 'hi', native: 'हिंदी', subtitle: 'Hindi' },
  { code: 'te', native: 'తెలుగు', subtitle: 'Telugu' },
  { code: 'ta', native: 'தமிழ்', subtitle: 'Tamil' },
  { code: 'bn', native: 'বাংলা', subtitle: 'Bengali' },
  { code: 'mr', native: 'मराठी', subtitle: 'Marathi' },
];

export const OnboardingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<number>(1);

  // Profile Form State
  const [language, setLanguage] = useState<string>(i18n.language || 'en');
  const [location, setLocation] = useState<ProfileLocation>(POPULAR_CITIES[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ProfileLocation[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const [family, setFamily] = useState<ProfileFamilyMember[]>([
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
  ]);

  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberAge, setNewMemberAge] = useState<number>(25);
  const [newMemberFlags, setNewMemberFlags] = useState<HealthFlags>({});

  const [home, setHome] = useState<ProfileHome>({
    windowsFacingRoad: true,
    purifier: true,
    chimney: true,
    cookingFuel: 'lpg',
    commuteMode: 'metro',
    windowsShut: true,
  });

  const [selectedMemberIdx, setSelectedMemberIdx] = useState<number>(0);

  // Step 5: Reveal State
  const [isCalculating, setIsCalculating] = useState<boolean>(true);
  const [outdoorPm25, setOutdoorPm25] = useState<number>(240);
  const [revealedCigarettes, setRevealedCigarettes] = useState<number>(9);
  const [targetCigarettes, setTargetCigarettes] = useState<number>(5);

  // Language selection
  const handleSelectLanguage = (code: string) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    localStorage.setItem('shwas_lang', code);
  };

  // Geolocation lookup
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          );
          if (res.ok) {
            const data = await res.json();
            const name =
              data.address?.city ||
              data.address?.town ||
              data.address?.suburb ||
              data.address?.state_district ||
              'My Location';
            setLocation({ lat: latitude, lon: longitude, name });
          } else {
            setLocation({ lat: latitude, lon: longitude, name: 'Current Location' });
          }
        } catch {
          setLocation({ lat: latitude, lon: longitude, name: 'Current Location' });
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setIsLocating(false);
        alert('Could not retrieve your location. Please choose a city below.');
      },
      { timeout: 10000 },
    );
  };

  // City Search via Nominatim (no key)
  const handleSearchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery.trim(),
        )}&countrycodes=in&limit=5`,
      );
      if (res.ok) {
        const list = await res.json();
        const mapped: ProfileLocation[] = list.map((item: any) => ({
          name: item.display_name.split(',')[0],
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
        }));
        setSearchResults(mapped);
      }
    } catch (err) {
      console.warn('City search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Add Family Member
  const handleAddMember = () => {
    if (!newMemberName.trim()) return;
    const newMember: ProfileFamilyMember = {
      id: `member_${Date.now()}`,
      name: newMemberName.trim(),
      age: Number(newMemberAge) || 20,
      flags: newMemberFlags,
      routine: { hoursOutside: 2, hoursAway: 6, awayPlace: 'office' },
    };
    setFamily([...family, newMember]);
    setNewMemberName('');
    setNewMemberAge(25);
    setNewMemberFlags({});
  };

  const handleRemoveMember = (id: string) => {
    if (family.length <= 1) return;
    setFamily(family.filter((f) => f.id !== id));
    if (selectedMemberIdx >= family.length - 1) {
      setSelectedMemberIdx(0);
    }
  };

  // Step 5: Reveal calculation trigger
  useEffect(() => {
    if (step === 5) {
      setIsCalculating(true);
      fetchOpenMeteoForecast(location.lat, location.lon)
        .then((res) => {
          const livePm25 = res.currentPm25 || 240;
          setOutdoorPm25(livePm25);

          // Calculate real cigarettes using single standardized family exposure function
          const { perPersonAverage } = calculateFamilyExposure(family, livePm25, home, 'all');
          const currentHero = perPersonAverage;

          // Compute capped plan savings using the exact same 70% cap logic as TodayPage
          const previewProfile: UserProfile = {
            language,
            location,
            family,
            home,
          };
          const previewPlan = buildEnrichedPlan(
            generateRuleBasedPlan(previewProfile, res.points),
            {},
            currentHero,
          );
          const cappedSavings = Number(
            previewPlan.reduce((sum, item) => sum + item.cigarettesSaved, 0).toFixed(1),
          );
          const targetHero = Number(
            Math.max(0, Math.min(currentHero, currentHero - cappedSavings)).toFixed(1),
          );

          setRevealedCigarettes(currentHero);
          setTargetCigarettes(targetHero);
        })
        .finally(() => {
          setTimeout(() => {
            setIsCalculating(false);
          }, 600);
        });
    }
  }, [step, location, home, family]);

  // Complete Onboarding & Save
  const handleComplete = async () => {
    const fullProfile: UserProfile = {
      language,
      location,
      family,
      home,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    };

    await upsertProfile(fullProfile);
    navigate('/today');
  };

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-5 flex flex-col justify-between selection:bg-teal-500/30 selection:text-teal-200">
      {/* Top Header & Progress Dots */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300">
              <Wind className="w-4 h-4" />
            </div>
            <div>
              <span className="font-display font-bold text-base text-white">Shwas</span>
              <span className="text-xs text-teal-400 ml-1">श्वास</span>
            </div>
          </div>

          {step > 1 && step < 5 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}
        </div>

        {/* 5-Step Progress Bar with Dots */}
        <div className="flex items-center justify-between gap-1.5 px-1 py-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                  s === step
                    ? 'bg-teal-400 shadow-[0_0_10px_#2DD4BF]'
                    : s < step
                      ? 'bg-teal-500/60'
                      : 'bg-white/10'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Main Step Body */}
      <div className="flex-1 my-4">
        {/* STEP 1: Language Tiles */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <Badge variant="mint" size="sm" className="mb-1">
                Step 1 of 5
              </Badge>
              <h2 className="text-xl font-bold font-display text-white">Choose your language</h2>
              <p className="text-xs text-slate-400">
                Shwas will guide your daily routine in your preferred language.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              {LANGUAGE_TILES.map((lang) => {
                const isSelected = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSelectLanguage(lang.code)}
                    className={`p-4 rounded-2xl text-left border transition-all duration-200 relative ${
                      isSelected
                        ? 'bg-teal-500/20 border-teal-400/60 shadow-lg shadow-teal-500/20 ring-1 ring-teal-400'
                        : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="text-lg font-bold text-white mb-0.5">{lang.native}</div>
                    <div className="text-xs text-slate-400 font-medium">{lang.subtitle}</div>
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-teal-400 text-slate-950 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Location */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <Badge variant="mint" size="sm" className="mb-1">
                Step 2 of 5
              </Badge>
              <h2 className="text-xl font-bold font-display text-white">
                Where does your family live?
              </h2>
              <p className="text-xs text-slate-400">
                Pollution levels change street by street. We use live satellite and station data.
              </p>
            </div>

            {/* Use My Location button */}
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={isLocating}
              className="w-full py-3 px-4 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-teal-500/25 transition-all shadow-sm shadow-teal-500/20"
            >
              <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'Locating with GPS...' : 'Use My Current Location'}</span>
            </button>

            {/* City search input */}
            <form onSubmit={handleSearchCity} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city, town or area in India..."
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/60"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="absolute right-2 top-2 p-1 text-slate-400 hover:text-teal-300"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="bg-[#141C2E] border border-white/10 rounded-xl p-1 space-y-1 shadow-2xl">
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setLocation(res);
                      setSearchResults([]);
                      setSearchQuery(res.name);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-teal-500/20 hover:text-teal-300 flex items-center justify-between"
                  >
                    <span>{res.name}</span>
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                ))}
              </div>
            )}

            {/* Popular cities quick chips */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Popular Cities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_CITIES.map((city) => {
                  const isSelected = location.name === city.name;
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => setLocation(city)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-sm shadow-teal-500/20'
                          : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08]'
                      }`}
                    >
                      {city.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Currently selected preview */}
            <GlassCard variant="mint" className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-semibold text-white">Selected: {location.name}</span>
              </div>
              <Badge variant="mint" size="sm">
                Ready
              </Badge>
            </GlassCard>
          </div>
        )}

        {/* STEP 3: Family Members & Health Flags */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <Badge variant="mint" size="sm" className="mb-1">
                Step 3 of 5
              </Badge>
              <h2 className="text-xl font-bold font-display text-white">
                Who breathes in your home?
              </h2>
              <p className="text-xs text-slate-400">
                Children and elders have smaller lung capacities and need tailored plan timings.
              </p>
            </div>

            {/* Existing member list */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {family.map((mem) => (
                <GlassCard
                  key={mem.id}
                  variant="subtle"
                  className="p-3 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {mem.name} ({mem.age} yrs)
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {mem.flags?.asthma && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-0.5">
                            <HeartPulse className="w-2.5 h-2.5" /> Asthma
                          </span>
                        )}
                        {mem.flags?.heart && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                            <ShieldAlert className="w-2.5 h-2.5" /> Heart
                          </span>
                        )}
                        {mem.flags?.pregnancy && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 flex items-center gap-0.5">
                            <Baby className="w-2.5 h-2.5" /> Pregnancy
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {family.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(mem.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </GlassCard>
              ))}
            </div>

            {/* Add Member Box */}
            <GlassCard className="p-3.5 space-y-2.5 border-teal-500/20 bg-teal-500/[0.04]">
              <div className="text-xs font-semibold text-teal-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Family Member
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-400"
                />
                <input
                  type="number"
                  placeholder="Age"
                  value={newMemberAge}
                  onChange={(e) => setNewMemberAge(parseInt(e.target.value) || 0)}
                  className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-400"
                />
              </div>

              {/* Health flag toggles */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setNewMemberFlags({
                      ...newMemberFlags,
                      asthma: !newMemberFlags.asthma,
                    })
                  }
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    newMemberFlags.asthma
                      ? 'bg-red-500/20 text-red-300 border-red-500/50'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                  }`}
                >
                  + Asthma / Bronchitis
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewMemberFlags({
                      ...newMemberFlags,
                      heart: !newMemberFlags.heart,
                    })
                  }
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    newMemberFlags.heart
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                  }`}
                >
                  + Heart condition
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewMemberFlags({
                      ...newMemberFlags,
                      pregnancy: !newMemberFlags.pregnancy,
                    })
                  }
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    newMemberFlags.pregnancy
                      ? 'bg-pink-500/20 text-pink-300 border-pink-500/50'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                  }`}
                >
                  + Pregnant
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddMember}
                className="w-full py-1.5 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 font-semibold text-xs rounded-lg transition-all"
              >
                Confirm Member
              </button>
            </GlassCard>
          </div>
        )}

        {/* STEP 4: Home & Routine */}
        {step === 4 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <Badge variant="mint" size="sm" className="mb-1">
                Step 4 of 5
              </Badge>
              <h2 className="text-xl font-bold font-display text-white">Home & Daily Routine</h2>
              <p className="text-xs text-slate-400">
                Building factors determine whether outdoor smog stays outside or seeps indoors.
              </p>
            </div>

            {/* Home Building Toggles */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-teal-400" /> Home Building Factors
              </div>

              <GlassCard variant="subtle" className="p-3 space-y-2.5 text-xs">
                {/* Windows facing road */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">Balcony / Windows Face Road</div>
                    <div className="text-[11px] text-slate-400">+20% traffic soot infiltration</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={home.windowsFacingRoad}
                    onChange={(e) => setHome({ ...home, windowsFacingRoad: e.target.checked })}
                    className="w-4 h-4 accent-teal-400"
                  />
                </div>

                {/* HEPA Purifier */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                  <div>
                    <div className="font-semibold text-white">HEPA Air Purifier at Home</div>
                    <div className="text-[11px] text-slate-400">
                      Clears 60% of indoor particulate matter
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={home.purifier}
                    onChange={(e) => setHome({ ...home, purifier: e.target.checked })}
                    className="w-4 h-4 accent-teal-400"
                  />
                </div>

                {/* Kitchen Chimney */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                  <div>
                    <div className="font-semibold text-white">Kitchen Chimney / Exhaust</div>
                    <div className="text-[11px] text-slate-400">
                      Extracts 70% of cooking grease/smoke
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={home.chimney}
                    onChange={(e) => setHome({ ...home, chimney: e.target.checked })}
                    className="w-4 h-4 accent-teal-400"
                  />
                </div>

                {/* Cooking fuel */}
                <div className="pt-1 border-t border-white/[0.05]">
                  <div className="font-semibold text-white mb-1">Cooking Fuel</div>
                  <div className="flex gap-2">
                    {['lpg', 'electric', 'wood'].map((fuel) => (
                      <button
                        key={fuel}
                        type="button"
                        onClick={() => setHome({ ...home, cookingFuel: fuel })}
                        className={`flex-1 py-1 px-2 rounded-lg text-xs capitalize border ${
                          home.cookingFuel === fuel
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-semibold'
                            : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                        }`}
                      >
                        {fuel === 'wood' ? 'Biomass / Wood' : fuel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Commute Mode */}
                <div className="pt-1 border-t border-white/[0.05]">
                  <div className="font-semibold text-white mb-1">Primary Commute Mode</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['metro', 'auto', 'bus', 'bike', 'car', 'walk'].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setHome({ ...home, commuteMode: mode })}
                        className={`py-1 px-1.5 rounded-lg text-[11px] capitalize border ${
                          home.commuteMode === mode
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-semibold'
                            : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Daily Routine Per Member */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-400" /> Member Routine Exposure
              </div>

              {/* Member select tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {family.map((mem, idx) => (
                  <button
                    key={mem.id}
                    type="button"
                    onClick={() => setSelectedMemberIdx(idx)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${
                      selectedMemberIdx === idx
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/50'
                        : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                    }`}
                  >
                    {mem.name}
                  </button>
                ))}
              </div>

              {family[selectedMemberIdx] && (
                <GlassCard variant="subtle" className="p-3 space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Hours Outdoors (Commute, Market):</span>
                      <strong className="text-teal-300 font-mono">
                        {family[selectedMemberIdx].routine.hoursOutside} hrs
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={family[selectedMemberIdx].routine.hoursOutside}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        const updated = [...family];
                        updated[selectedMemberIdx].routine.hoursOutside = val;
                        setFamily(updated);
                      }}
                      className="w-full accent-teal-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Hours Away (Office / School):</span>
                      <strong className="text-teal-300 font-mono">
                        {family[selectedMemberIdx].routine.hoursAway} hrs
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="14"
                      step="1"
                      value={family[selectedMemberIdx].routine.hoursAway}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        const updated = [...family];
                        updated[selectedMemberIdx].routine.hoursAway = val;
                        setFamily(updated);
                      }}
                      className="w-full accent-teal-400"
                    />
                  </div>

                  <div className="text-[11px] text-slate-400 border-t border-white/[0.05] pt-2 flex justify-between">
                    <span>Hours remaining at home:</span>
                    <strong className="text-white font-mono">
                      {Math.max(
                        0,
                        24 -
                          family[selectedMemberIdx].routine.hoursOutside -
                          family[selectedMemberIdx].routine.hoursAway,
                      )}{' '}
                      hrs
                    </strong>
                  </div>
                </GlassCard>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: Reveal */}
        {step === 5 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {isCalculating ? (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-teal-400/40 animate-ping opacity-50" />
                  <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-400/50 flex items-center justify-center text-teal-300 shadow-xl shadow-teal-500/30">
                    <Wind className="w-8 h-8 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-display">
                    Calculating your air...
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Fetching live Open-Meteo data for {location.name} and computing building
                    infiltration.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Badge variant="danger" size="sm" className="mb-1">
                    Air Exposure Analysis
                  </Badge>
                  <h2 className="text-xl font-bold font-display text-white">
                    Your family's cigarette exposure
                  </h2>
                  <p className="text-xs text-slate-400">
                    Based on 22 µg/m³ PM2.5 in a day = 1 cigarette.
                  </p>
                </div>

                {/* Hero Reveal Card */}
                <GlassCard
                  variant="danger"
                  className="p-6 text-center space-y-3 bg-gradient-to-b from-[#2b1612]/90 to-[#1b1012]/90 border-red-500/30"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs text-amber-300 font-medium">
                    <Cigarette className="w-4 h-4 text-amber-400" />
                    <span>Your family breathes (per person average)</span>
                  </div>

                  <div className="flex items-baseline justify-center gap-2">
                    <span className="font-numbers text-7xl font-bold tracking-tight text-white drop-shadow-lg">
                      {revealedCigarettes.toFixed(1)}
                    </span>
                    <span className="text-lg font-sans text-slate-300 font-medium">
                      cigarettes / day
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-semibold">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    <span>
                      {revealedCigarettes.toFixed(1)} → {targetCigarettes.toFixed(1)} with your
                      daily air plan
                    </span>
                  </div>

                  <div className="pt-2 text-[11px] text-slate-400 border-t border-white/[0.08]">
                    Outdoor PM2.5: <strong className="text-white">{outdoorPm25} µg/m³</strong> in{' '}
                    {location.name}
                  </div>
                </GlassCard>

                {/* Per Member Breakdown */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Exposure Per Member
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {family.map((mem) => {
                      const cigs = calculateMemberDailyCigarettes(mem, outdoorPm25, home);
                      return (
                        <div
                          key={mem.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{mem.name}</span>
                            <span className="text-slate-400 text-[11px]">({mem.age} yrs)</span>
                          </div>
                          <div className="font-mono font-bold text-amber-300">
                            {cigs.toFixed(1)} cigs/day
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA Button */}
      <div className="pt-2">
        {step < 5 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="w-full py-3.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/25 active:scale-[0.99]"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          !isCalculating && (
            <button
              type="button"
              onClick={handleComplete}
              className="w-full py-3.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/25 active:scale-[0.99]"
            >
              <span>See My Plan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
