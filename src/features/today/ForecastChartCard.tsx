import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock } from 'lucide-react';
import {
  Area,
  AreaChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import GlassCard from '../../components/ui/GlassCard';
import Badge from '../../components/ui/Badge';
import {
  formatForecastUpdatedAgo,
  type BestAirWindow,
  type ForecastDataPoint,
} from '../../lib/forecast';
import { CHART_COLORS } from '../../shared/constants';

const ForecastTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { day: string; time: string; pm25: number; usAqi: number } }>;
}) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-surface-popover/95 border border-white/10 rounded-xl p-2.5 shadow-2xl backdrop-blur-xl text-xs space-y-0.5">
      <div className="font-semibold text-slate-200">
        {data.day} · {data.time}
      </div>
      <div className="text-teal-300 font-mono font-medium">PM2.5: {data.pm25} µg/m³</div>
      <div className="text-slate-400 text-[10px]">Open-Meteo US AQI: {data.usAqi}</div>
    </div>
  );
};

interface ForecastChartCardProps {
  forecastPoints: ForecastDataPoint[];
  bestWindow: BestAirWindow;
  isMlForecast: boolean;
  isSampleData: boolean;
  modelMae: number | null;
  mlGeneratedAt: string | null;
  sourceLabel: string;
}

export const ForecastChartCard: React.FC<ForecastChartCardProps> = ({
  forecastPoints,
  bestWindow,
  isMlForecast,
  isSampleData,
  modelMae,
  mlGeneratedAt,
  sourceLabel,
}) => {
  const { t } = useTranslation();

  return (
    <GlassCard className="border-white/[0.08] bg-surface-chart/60 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
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
            {isMlForecast && mlGeneratedAt && (
              <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                {formatForecastUpdatedAgo(mlGeneratedAt)}
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
            isSampleData
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : 'bg-teal-500/10 text-teal-300 border-teal-500/30'
          }`}
        >
          {isMlForecast && modelMae !== null
            ? `Model MAE ±${Math.round(modelMae)} µg/m³`
            : sourceLabel}
        </span>
      </div>

      <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center gap-2.5 my-2">
        <Clock className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
        <span className="text-xs text-teal-200 font-medium">
          Best upcoming window: <strong>{bestWindow.label}</strong> ({bestWindow.avgPm25} µg/m³, AQI{' '}
          {bestWindow.avgAqi})
        </span>
      </div>

      <div className="w-full h-44 mt-3 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecastPoints} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.mint} stopOpacity={0.45} />
                <stop offset="95%" stopColor={CHART_COLORS.mint} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              stroke={CHART_COLORS.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={7}
            />
            <YAxis
              stroke={CHART_COLORS.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={[0, 'auto']}
            />
            <Tooltip content={<ForecastTooltip />} />

            {bestWindow.chartStart && bestWindow.chartEnd && (
              <ReferenceArea
                x1={bestWindow.chartStart}
                x2={bestWindow.chartEnd}
                fill={CHART_COLORS.mint}
                fillOpacity={0.22}
                stroke={CHART_COLORS.mint}
                strokeOpacity={0.6}
                strokeDasharray="3 3"
              />
            )}

            <Area
              type="monotone"
              dataKey="pm25"
              stroke={CHART_COLORS.mint}
              strokeWidth={2}
              fill="url(#forecastAreaGradient)"
              dot={false}
              activeDot={{ r: 4, fill: CHART_COLORS.mint }}
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
  );
};
