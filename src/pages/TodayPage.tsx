import React, { useState, useEffect, useMemo } from 'react';
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
import { generate48HourForecast, computeBestWindow } from '../lib/forecast';

interface PlanItem {
  id: string;
  title: string;
  description: string;
  cigarettesSaved: number;
  completed: boolean;
  time: string;
}

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
      // Ease out cubic
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
  payload?: Array<{ payload: { day: string; time: string; pm25: number; aqi: number } }>;
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
          Est. AQI ≈ {data.aqi}
        </div>
      </div>
    );
  }
  return null;
};

export const TodayPage: React.FC = () => {
  const { t } = useTranslation();
  const { aqi, selectedFamilyId } = useAirQuality();

  // 1. Generate forecast dataset and compute single consistent best air window
  const forecastData = useMemo(() => generate48HourForecast(), []);
  const bestWindow = useMemo(() => computeBestWindow(forecastData), [forecastData]);

  // 2. Base exposure calculations per family member
  // Delhi winter benchmark:
  // All / Me = 9.0 (base) -> 5.1 (target, saving 3.9)
  // Grandpa = 10.5 -> 6.6
  // Child (Aarav) = 7.6 -> 3.7
  const baseCigarettes = useMemo(() => {
    if (selectedFamilyId === 'grandpa') return 10.5;
    if (selectedFamilyId === 'child') return 7.6;
    return 9.0;
  }, [selectedFamilyId]);

  // 3. Interactive Plan Items (Computed consistently with best air window)
  const [planItems, setPlanItems] = useState<PlanItem[]>([
    {
      id: '1',
      title: 'Keep balcony windows shut during morning commute peak',
      description: 'Heavy truck & diesel exhaust on main road between 7:30 – 10:00 AM.',
      cigarettesSaved: 1.4,
      completed: false,
      time: '8:00 AM',
    },
    {
      id: '2',
      title: `Airing & cross-ventilation window (${bestWindow.label})`,
      description: `Sun warms boundary layer, dispersing local smog plume to lowest levels of the day (${bestWindow.avgPm25} µg/m³).`,
      cigarettesSaved: 0.8,
      completed: false,
      time: bestWindow.startTime,
    },
    {
      id: '3',
      title: 'Take Yellow Line Metro instead of Outer Ring Road auto',
      description: 'Underground filtered air cabin reduces peak transit exposure.',
      cigarettesSaved: 1.2,
      completed: false,
      time: '5:30 PM',
    },
    {
      id: '4',
      title: 'Run HEPA air purifier on sleep mode in bedroom',
      description: 'Maintains indoor PM2.5 below 60 µg/m³ overnight.',
      cigarettesSaved: 0.5,
      completed: false,
      time: '10:00 PM',
    },
  ]);

  // Toggle plan item completion
  const togglePlanItem = (id: string) => {
    setPlanItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  // Total potential savings if all actions are completed
  const totalPotentialSavings = useMemo(() => {
    return planItems.reduce((acc, item) => acc + item.cigarettesSaved, 0);
  }, [planItems]);

  const targetCigarettes = Math.max(0, baseCigarettes - totalPotentialSavings);

  // Active savings from checked items
  const checkedSavings = useMemo(() => {
    return planItems
      .filter((item) => item.completed)
      .reduce((acc, item) => acc + item.cigarettesSaved, 0);
  }, [planItems]);

  // Current exposure decreases as user checks off items: e.g. 9.0 -> 7.6
  const targetCurrentExposure = Math.max(targetCigarettes, baseCigarettes - checkedSavings);
  const animatedExposure = useAnimatedNumber(targetCurrentExposure, 400);

  // Format animated number: whole number if close to integer, else 1 decimal place
  const formatHeroNumber = (val: number) => {
    const rounded = Math.round(val);
    if (Math.abs(val - rounded) < 0.05) {
      return rounded.toString();
    }
    return val.toFixed(1);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Hero Cigarette Card */}
      <GlassCard className="relative overflow-hidden py-5 px-4 border-white/[0.1] bg-gradient-to-b from-[#182030]/80 to-[#101624]/90">
        {/* Top header row: Subtitle and Badge separated in a flex layout so they never overlap at any screen width */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium min-w-0">
            <Cigarette className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              {t('today.heroSubtitle', 'breathed today across your routine')}
            </span>
          </div>

          <Badge
            variant="mint"
            size="sm"
            icon={<TrendingDown className="w-3 h-3" />}
            className="shrink-0 whitespace-nowrap"
          >
            -{totalPotentialSavings.toFixed(1)} {t('today.heroCigarettes', 'cigs')}
          </Badge>
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

        {/* Plan Impact Arc Badge (Bug 2 fix: no duplicated target number) */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="whitespace-nowrap">
              {Math.round(baseCigarettes)}{' '}
              <ArrowRight className="w-3 h-3 inline mx-0.5 text-teal-400" />{' '}
              {Math.round(targetCigarettes)}{' '}
              {t('today.targetPlan', 'if you follow your plan')}
            </span>
          </div>
        </div>

        {/* Status / Station footer */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="whitespace-nowrap">
              Station AQI: <strong className="text-slate-200 font-numbers">{aqi}</strong>
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

      {/* 48-Hour Forecast Card (Recharts Area Chart with Mint Best Window Shading) */}
      <GlassCard className="border-white/[0.08] bg-[#121927]/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              {t('today.forecastTitle', '48-Hour Forecast')}
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            PM2.5 (µg/m³)
          </span>
        </div>

        {/* Consistent Best Air Window Banner */}
        <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center gap-2.5 my-2">
          <Clock className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs text-teal-200 font-medium">
            Best air window: <strong>{bestWindow.label}</strong> ({bestWindow.avgPm25} µg/m³)
          </span>
        </div>

        {/* Real Recharts Area Chart container with fixed height */}
        <div className="w-full h-44 mt-3 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={forecastData}
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
                domain={[0, 400]}
              />
              <Tooltip content={<ForecastTooltip />} />

              {/* Shading best clean-air window in mint */}
              <ReferenceArea
                x1={bestWindow.chartStart}
                x2={bestWindow.chartEnd}
                fill="#2DD4BF"
                fillOpacity={0.22}
                stroke="#2DD4BF"
                strokeOpacity={0.6}
                strokeDasharray="3 3"
              />

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

      {/* Today's Air Plan Timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('today.planTimeline', "Today's Air Plan Timeline")}
          </h3>
          <span className="text-[11px] text-teal-300 font-medium whitespace-nowrap">
            {checkedSavings > 0
              ? `${checkedSavings.toFixed(1)} cigs saved so far`
              : `Save up to ${totalPotentialSavings.toFixed(1)} cigs`}
          </span>
        </div>

        {/* Plan item list with interactive toggle */}
        <div className="space-y-2">
          {planItems.map((item) => {
            return (
              <GlassCard
                key={item.id}
                variant={item.completed ? 'mint' : 'subtle'}
                onClick={() => togglePlanItem(item.id)}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-all duration-200 select-none ${
                  item.completed
                    ? 'border-teal-500/40 shadow-sm shadow-teal-500/10'
                    : 'hover:border-white/15'
                }`}
              >
                {/* Checkbox Icon */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlanItem(item.id);
                  }}
                  className="mt-0.5 shrink-0 focus:outline-none"
                  aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-teal-400 transition-transform active:scale-90" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-500 hover:text-slate-300 transition-transform active:scale-90" />
                  )}
                </button>

                {/* Plan Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={`text-xs font-semibold leading-tight min-w-0 pr-1 ${
                        item.completed ? 'text-teal-200 line-through opacity-85' : 'text-slate-100'
                      }`}
                    >
                      {item.title}
                    </h4>

                    {/* Non-wrapping, compact badge (Bug 6 fix) */}
                    <Badge
                      variant={item.completed ? 'mint' : 'neutral'}
                      size="sm"
                      className="shrink-0 whitespace-nowrap font-mono"
                    >
                      -{item.cigarettesSaved} cigs
                    </Badge>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {item.description}
                  </p>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TodayPage;
