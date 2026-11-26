import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cigarette,
  ArrowRight,
  Sparkles,
  TrendingDown,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Calendar,
  Sparkle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from 'recharts';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import { useAirQuality } from '../components/layout/AppLayout';
import {
  fetchSmartForecast,
  getOfflineFallbackForecast,
  computeBestWindow,
  ForecastDataPoint,
} from '../lib/forecast';
import { calculateFamilyExposure } from '../lib/cigarettes';
import {
  generateRuleBasedPlan,
  buildEnrichedPlan,
  parsePlanCache,
  serializePlanCache,
} from '../lib/planGenerator';
import { upsertTodayDailySavings } from '../lib/communityService';
import { RawPlanItem, UserProfile } from '../types';

/**
 * Hook to animate numerical transitions with an ease-out cubic curve.
 */
function useAnimatedNumber(target: number, duration = 400): number {
  const [current, setCurrent] = useState(target);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = current;
    const diff = target - startValue;

    if (Math.abs(diff) < 0.01) {
      setCurrent(target);
      return;
    }

    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const nextVal = startValue + diff * easeOut;
      setCurrent(nextVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setCurrent(target);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [target]);

  return current;
}

// Custom tooltip for Recharts 48-Hour Forecast Area Chart
const ForecastTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { day: string; time: string; pm25: number; usAqi: number } }>;
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#0e1626]/95 border border-white/10 rounded-xl p-2.5 shadow-2xl backdrop-blur-xl text-xs space-y-0.5">
        <div className="font-semibold text-slate-200">
          {data.day} · {data.time}
        </div>
        <div className="text-teal-300 font-mono font-medium">
          PM2.5: {data.pm25} µg/m³
        </div>
        <div className="text-slate-400 text-[10px]">
          Open-Meteo US AQI: {data.usAqi}
        </div>
      </div>
    );
  }
  return null;
};

export const TodayPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    aqi,
    pm25: outdoorPm25,
    selectedFamilyId,
    userProfile,
    setAirQuality,
    setCityName,
  } = useAirQuality();

  // 1. Live forecast state (Supabase Shwas ML if fresh < 3h, else Open-Meteo fallback)
  const [forecastPoints, setForecastPoints] = useState<ForecastDataPoint[]>(
    () => getOfflineFallbackForecast().points
  );
  const [isSampleData, setIsSampleData] = useState<boolean>(true);
  const [isMlForecast, setIsMlForecast] = useState<boolean>(false);
  const [modelMae, setModelMae] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>('Sample data (offline fallback)');

  // 2. Daily Air Plan state & Plan Source (Gemini vs Rule-based fallback)
  const [rawPlanItems, setRawPlanItems] = useState<RawPlanItem[]>([]);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [planSource, setPlanSource] = useState<string>('loading');
  const [isPlanLoading, setIsPlanLoading] = useState<boolean>(false);
  const [isStillThinking, setIsStillThinking] = useState<boolean>(false);
  const planRequestInFlight = useRef<string | null>(null);

  // Fetch smart forecast (fresh Supabase ML -> Open-Meteo fallback) for profile location
  useEffect(() => {
    let active = true;
    const lat = userProfile?.location?.lat || 28.6139;
    const lon = userProfile?.location?.lon || 77.2090;
    const locName = userProfile?.location?.name || 'Delhi NCR';

    if (setCityName) setCityName(locName);

    fetchSmartForecast(lat, lon).then((res) => {
      if (active) {
        setForecastPoints(res.points);
        setIsSampleData(res.isSampleData);
        setIsMlForecast(Boolean(res.isMlForecast));
        setModelMae(typeof res.modelMae === 'number' ? res.modelMae : null);
        setSourceLabel(res.sourceLabel);
        if (setAirQuality && res.currentAqi) {
          setAirQuality(res.currentAqi, res.currentPm25);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [userProfile?.location?.lat, userProfile?.location?.lon]);

  // 3. Compute best clean-air window searching upcoming hours only (from now through next 24h)
  const bestWindow = useMemo(() => {
    return computeBestWindow(forecastPoints, new Date());
  }, [forecastPoints]);

  // 4. Fallback profile if none exists in localStorage
  const effectiveProfile: UserProfile = useMemo(() => {
    if (userProfile && userProfile.family && userProfile.family.length > 0) {
      return userProfile;
    }
    return {
      language: 'en',
      location: { lat: 28.6139, lon: 77.2090, name: 'Delhi NCR' },
      family: [
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
      ],
      home: {
        windowsFacingRoad: true,
        purifier: true,
        chimney: true,
        cookingFuel: 'lpg',
        commuteMode: 'metro',
        windowsShut: true,
      },
    };
  }, [userProfile]);

  // 5. Daily Air Plan fetching from /api/plan with daily caching and request deduplication
  useEffect(() => {
    let active = true;
    const dateStr = new Date().toISOString().slice(0, 10);
    const lang = effectiveProfile.language || 'en';
    const loc = effectiveProfile.location?.name || 'city';
    const dedupeKey = `${dateStr}_${lang}_${loc}`;
    const cacheKey = `shwas_plan_${dedupeKey}`;
    const completedCacheKey = `shwas_plan_completed_${dateStr}`;

    // Read cached completed state
    let savedCompletedMap: Record<string, boolean> = {};
    try {
      const storedCompleted = localStorage.getItem(completedCacheKey);
      if (storedCompleted) {
        savedCompletedMap = JSON.parse(storedCompleted);
      }
    } catch {
      // ignore
    }
    setCompletedMap(savedCompletedMap);

    // Check plan cache first (supports { source, items, createdAt } and migrates legacy arrays)
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      const cachedEntry = parsePlanCache(cachedRaw);
      if (cachedEntry && cachedEntry.items.length >= 5) {
        setRawPlanItems(cachedEntry.items);
        setPlanSource(cachedEntry.source);
        setIsPlanLoading(false);
        // Migrate legacy plain-array entry in place
        if (cachedRaw && cachedRaw.trim().startsWith('[')) {
          localStorage.setItem(cacheKey, serializePlanCache(cachedEntry.source, cachedEntry.items));
        }
        return;
      }
    } catch {
      // cache miss
    }

    // Deduplicate: if an identical request is already in flight, don't fire another
    if (planRequestInFlight.current === dedupeKey) {
      return;
    }
    planRequestInFlight.current = dedupeKey;

    // Fetch from serverless /api/plan with a 25-second loading timeout (showing "Still thinking..." after 8s)
    setIsPlanLoading(true);
    setIsStillThinking(false);

    const abortController = new AbortController();
    const stillThinkingTimer = setTimeout(() => {
      if (active) setIsStillThinking(true);
    }, 8000);

    const timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, 25000);

    fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: effectiveProfile,
        forecast: forecastPoints.slice(0, 24),
      }),
      signal: abortController.signal,
    })
      .then((res) => {
        clearTimeout(stillThinkingTimer);
        clearTimeout(timeoutTimer);
        if (!res.ok) throw new Error(`Plan API error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        clearTimeout(stillThinkingTimer);
        clearTimeout(timeoutTimer);
        if (!active) return;
        // Always render returned items for ANY source
        const rawPlan = (Array.isArray(data?.plan) && data.plan.length >= 5)
          ? data.plan
          : generateRuleBasedPlan(effectiveProfile, forecastPoints);
        const resolvedSource = data?.source || 'rule_based';
        setRawPlanItems(rawPlan);
        setPlanSource(resolvedSource);
        localStorage.setItem(cacheKey, serializePlanCache(resolvedSource, rawPlan));
      })
      .catch((err) => {
        clearTimeout(stillThinkingTimer);
        clearTimeout(timeoutTimer);
        if (!active) return;
        console.warn('[TodayPage] Plan fetch dropped to rule generator fallback:', err);
        const fallback = generateRuleBasedPlan(effectiveProfile, forecastPoints);
        setRawPlanItems(fallback);
        setPlanSource('offline');
      })
      .finally(() => {
        clearTimeout(stillThinkingTimer);
        clearTimeout(timeoutTimer);
        planRequestInFlight.current = null;
        if (active) {
          setIsPlanLoading(false);
          setIsStillThinking(false);
        }
      });

    return () => {
      active = false;
      clearTimeout(stillThinkingTimer);
      clearTimeout(timeoutTimer);
      if (planRequestInFlight.current === dedupeKey) {
        planRequestInFlight.current = null;
      }
    };
  }, [effectiveProfile.language, effectiveProfile.location?.name]);

  // Toggle plan item completion and persist to daily completed cache
  const togglePlanItem = (id: string) => {
    setCompletedMap((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      if (!updated[id]) {
        delete updated[id];
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const completedCacheKey = `shwas_plan_completed_${dateStr}`;
      localStorage.setItem(completedCacheKey, JSON.stringify(updated));

      return updated;
    });
  };

  // 6. Calculate real member-specific daily cigarette exposure using unified function
  const baseCigarettes = useMemo(() => {
    const liveOutdoor = outdoorPm25 || 240;
    const home = effectiveProfile.home;
    const { cigarettes } = calculateFamilyExposure(
      effectiveProfile.family,
      liveOutdoor,
      home,
      selectedFamilyId
    );
    return cigarettes;
  }, [selectedFamilyId, outdoorPm25, effectiveProfile]);

  // Derive enriched plan items reactively on the SAME basis as baseCigarettes (selected member or family average)
  // Item savings are scaled proportionally so their sum NEVER exceeds 70% of baseCigarettes.
  const planItems = useMemo(() => {
    return buildEnrichedPlan(rawPlanItems, completedMap, baseCigarettes);
  }, [rawPlanItems, completedMap, baseCigarettes]);

  // Compute total savings from plan items (never trusting model math)
  const totalPotentialSavings = useMemo(() => {
    const sum = planItems.reduce((acc, item) => acc + item.cigarettesSaved, 0);
    return Number(sum.toFixed(1));
  }, [planItems]);

  // Target Y = X minus total savings, never higher than X, 1 decimal place
  const targetCigarettes = useMemo(() => {
    const reduced = Math.max(0, baseCigarettes - totalPotentialSavings);
    return Number(Math.min(baseCigarettes, reduced).toFixed(1));
  }, [baseCigarettes, totalPotentialSavings]);

  const checkedSavings = useMemo(() => {
    const sum = planItems
      .filter((item) => item.completed)
      .reduce((acc, item) => acc + item.cigarettesSaved, 0);
    return Number(sum.toFixed(1));
  }, [planItems]);

  // Sync checked plan savings to Community daily_savings whenever user checks/unchecks items
  useEffect(() => {
    if (planItems.length === 0) return;
    const selfName = effectiveProfile.family?.[0]?.name || 'My Family';
    const familyLabel =
      selfName.toLowerCase() === 'me' ? 'My Family' : `${selfName}'s Family`;
    upsertTodayDailySavings(checkedSavings, familyLabel);
  }, [checkedSavings, planItems.length, effectiveProfile.family]);

  // Current exposure decreases as user checks off items: e.g. 9.0 -> 7.6
  const targetCurrentExposure = Math.max(targetCigarettes, baseCigarettes - checkedSavings);
  const animatedExposure = useAnimatedNumber(targetCurrentExposure, 400);

  const formatHeroNumber = (val: number) => {
    return val.toFixed(1);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Hero Cigarette Card */}
      <GlassCard className="relative overflow-hidden py-5 px-4 border-white/[0.1] bg-gradient-to-b from-[#182030]/80 to-[#101624]/90">
        {/* Top header row: Subtitle and Badge separated in flex layout so they never overlap */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium min-w-0">
            <Cigarette className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {selectedFamilyId === 'all'
                ? t('today.familyAverage', 'per person (family average)')
                : t('today.heroSubtitle', 'breathed today across your routine')}
            </span>
          </div>

          {totalPotentialSavings > 0.0 && (
            <Badge
              variant="mint"
              size="sm"
              icon={<TrendingDown className="w-3 h-3" />}
              className="shrink-0 whitespace-nowrap"
            >
              -{totalPotentialSavings.toFixed(1)} {t('today.heroCigarettes', 'cigs')}
            </Badge>
          )}
        </div>

        {/* Hero Number in Space Grotesk with smooth countdown */}
        <div className="flex items-baseline justify-center gap-2 my-2.5">
          <span className="font-numbers text-6xl font-bold tracking-tight text-white drop-shadow-md transition-all">
            {formatHeroNumber(animatedExposure)}
          </span>
          <span className="font-sans text-lg text-slate-300 font-medium">
            {t('today.heroCigarettes', 'cigarettes')}
          </span>
        </div>

        {/* Plan Impact Arc Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="whitespace-nowrap flex items-center gap-1.5">
              <span>{baseCigarettes.toFixed(1)}</span>
              <ArrowRight className="w-3 h-3 text-teal-400 inline shrink-0" />
              <span>{targetCigarettes.toFixed(1)}</span>
              <span>{t('today.targetPlan', 'if you follow your plan')}</span>
            </span>
          </div>
        </div>

        {/* Status / Station footer with real location and live Open-Meteo AQI */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="whitespace-nowrap">
              {effectiveProfile.location.name} AQI: <strong className="text-slate-200 font-numbers">{aqi}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <AlertCircle className="w-3 h-3 text-amber-400/80 shrink-0" />
            <span className="truncate">
              {t('app.disclaimer', 'Awareness estimate, not a medical measurement.')}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* 48-Hour Forecast Card (Shwas ML when fresh < 3h, else Open-Meteo 48-Hour Forecast) */}
      <GlassCard className="border-white/[0.08] bg-[#121927]/60 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-200 truncate">
              {isMlForecast
                ? t('today.forecastMlTitle', 'Shwas Forecast (ML)')
                : t('today.forecastTitle', '48-Hour Forecast')}
            </h3>
            {isMlForecast && (
              <Badge variant="mint" size="sm" className="shrink-0">
                ML
              </Badge>
            )}
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${isSampleData
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-teal-500/10 text-teal-300 border-teal-500/30'
              }`}
          >
            {isMlForecast && modelMae !== null
              ? `Model MAE ±${Math.round(modelMae)} µg/m³`
              : sourceLabel}
          </span>
        </div>

        {/* Consistent Best Air Window Banner */}
        <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center gap-2.5 my-2">
          <Clock className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs text-teal-200 font-medium">
            Best upcoming window: <strong>{bestWindow.label}</strong> ({bestWindow.avgPm25} µg/m³, AQI {bestWindow.avgAqi})
          </span>
        </div>

        {/* Real Recharts Area Chart container with fixed height */}
        <div className="w-full h-44 mt-3 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={forecastPoints}
              margin={{ top: 8, right: 10, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="forecastAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="time"
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={7}
              />
              <YAxis
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={[0, 'auto']}
              />
              <Tooltip content={<ForecastTooltip />} />

              {/* Shading upcoming best clean-air window in mint */}
              {bestWindow.chartStart && bestWindow.chartEnd && (
                <ReferenceArea
                  x1={bestWindow.chartStart}
                  x2={bestWindow.chartEnd}
                  fill="#2DD4BF"
                  fillOpacity={0.22}
                  stroke="#2DD4BF"
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                />
              )}

              <Area
                type="monotone"
                dataKey="pm25"
                stroke="#2DD4BF"
                strokeWidth={2}
                fill="url(#forecastAreaGradient)"
                dot={false}
                activeDot={{ r: 4, fill: '#2DD4BF' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 px-1 border-t border-white/[0.04] pt-2">
          <span>Now</span>
          <span className="text-teal-300 font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
            Window: {bestWindow.label}
          </span>
          <span>+48h</span>
        </div>
      </GlassCard>

      {/* Today's Air Plan Timeline (Generated via Gemini serverless function /api/plan) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('today.planTimeline', "Today's Air Plan Timeline")}
            </h3>
            {isPlanLoading && planItems.length === 0 ? (
              <span className="text-[10px] text-teal-400 animate-pulse" role="status">
                {isStillThinking
                  ? t('today.stillThinking', 'Still thinking…')
                  : t('today.generating', 'Generating...')}
              </span>
            ) : planSource === 'gemini' ? (
              <Badge variant="mint" size="sm" icon={<Sparkle className="w-2.5 h-2.5" aria-hidden="true" />}>
                Gemini
              </Badge>
            ) : null}
          </div>
          <span className="text-[11px] text-teal-300 font-medium whitespace-nowrap">
            {checkedSavings > 0
              ? `${checkedSavings.toFixed(1)} cigs saved so far`
              : `Save up to ${totalPotentialSavings.toFixed(1)} cigs`}
          </span>
        </div>

        {/* Plan item list */}
        <div className="space-y-2">
          {planItems.map((item) => {
            return (
              <GlassCard
                key={item.id}
                variant={item.completed ? 'mint' : 'subtle'}
                onClick={() => togglePlanItem(item.id)}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-all duration-200 select-none ${item.completed
                    ? 'border-teal-500/40 shadow-sm shadow-teal-500/10'
                    : 'hover:border-white/15'
                  }`}
              >
                {/* Checkbox Icon */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.completed}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlanItem(item.id);
                  }}
                  className="mt-0.5 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.action}`}
                >
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-teal-400 transition-transform active:scale-90" aria-hidden="true" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-500 hover:text-slate-300 transition-transform active:scale-90" aria-hidden="true" />
                  )}
                </button>

                {/* Plan Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 min-w-0 pr-1">
                      <span className="text-[10px] font-mono text-teal-300/90 font-medium shrink-0">
                        {item.time}
                      </span>
                      <h4
                        className={`text-xs font-semibold leading-tight min-w-0 ${item.completed ? 'text-teal-200 line-through opacity-85' : 'text-slate-100'
                          }`}
                      >
                        {item.action}
                      </h4>
                    </div>

                    {/* Non-wrapping, compact badge computed with savingFromAction */}
                    {item.cigarettesSaved > 0 && (
                      <Badge
                        variant={item.completed ? 'mint' : 'neutral'}
                        size="sm"
                        className="shrink-0 whitespace-nowrap font-mono"
                      >
                        -{item.cigarettesSaved.toFixed(1)} cigs
                      </Badge>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {item.reason}
                  </p>
                </div>
              </GlassCard>
            );
          })}
        </div>

        {/* Small label under the plan: "Plan by Gemini" when source is "gemini", otherwise "Offline plan" */}
        <div className="text-center pt-1 pb-1">
          <span className="text-[11px] font-mono text-slate-400">
            {planSource === 'gemini'
              ? t('today.planByGemini', 'Plan by Gemini')
              : t('today.offlinePlan', 'Offline plan')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TodayPage;
