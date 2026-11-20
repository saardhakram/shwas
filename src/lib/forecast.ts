export interface ForecastDataPoint {
  hourIndex: number;
  time: string;
  hour: number;
  day: 'Today' | 'Tomorrow';
  pm25: number;
  aqi: number;
}

export interface BestAirWindow {
  startHour: number;
  endHour: number;
  startTime: string;
  endTime: string;
  label: string;
  shortLabel: string;
  chartStart: string;
  chartEnd: string;
  avgPm25: number;
}

/**
 * Formats an hour number (0-23) into clean 12-hour string (e.g. 14 -> "2 PM")
 */
export function formatHourShort(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayH} ${period}`;
}

/**
 * Formats an hour number into minute-precision 12-hour string (e.g. 14 -> "2:00 PM")
 */
export function formatHourFull(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayH}:00 ${period}`;
}

/**
 * Generates a realistic 48-hour winter PM2.5 forecast curve for urban centers (e.g. Delhi NCR).
 * Diurnal characteristics:
 * - High inversion & morning peak (7-9 AM) ~320-360 µg/m³
 * - Solar surface heating breaks inversion midday, improving air between 2 PM – 4 PM ~110-130 µg/m³
 * - Evening peak (8-11 PM) spikes again ~280-320 µg/m³
 */
export function generate48HourForecast(): ForecastDataPoint[] {
  const points: ForecastDataPoint[] = [];

  // Typical diurnal pattern in Delhi winter across 24 hours (0h to 23h)
  const diurnalPm25 = [
    260, 275, 290, 310, 330, 345, // 00:00 - 05:00 Night accumulation
    355, 360, 340, 290, 230, 180, // 06:00 - 11:00 Morning peak & warming
    150, 130, 120, 125, 140, 180, // 12:00 - 17:00 Afternoon dispersion window
    220, 260, 290, 305, 295, 275, // 18:00 - 23:00 Evening rush & calm night
  ];

  for (let i = 0; i < 48; i++) {
    const hour = i % 24;
    const day: 'Today' | 'Tomorrow' = i < 24 ? 'Today' : 'Tomorrow';
    
    // Day 2 has slightly different weather dispersion (10% variance)
    const variance = i >= 24 ? -12 : 0;
    const pm25 = Math.max(30, diurnalPm25[hour] + variance);
    const aqi = Math.round(pm25 * 1.15);

    points.push({
      hourIndex: i,
      time: formatHourShort(hour),
      hour,
      day,
      pm25,
      aqi,
    });
  }

  return points;
}

/**
 * Computes the single optimal clean-air window across daytime hours (11:00 to 18:00)
 * Evaluates consecutive hours to find the minimum average PM2.5.
 */
export function computeBestWindow(forecast: ForecastDataPoint[]): BestAirWindow {
  // Focus on daytime window of today (hours 11 AM to 6 PM)
  const todayPoints = forecast.slice(0, 24);
  const candidates = todayPoints.filter((p) => p.hour >= 11 && p.hour <= 18);

  if (candidates.length < 2) {
    return {
      startHour: 14,
      endHour: 16,
      startTime: '2:00 PM',
      endTime: '4:00 PM',
      label: '2:00 PM – 4:00 PM',
      shortLabel: '2–4 PM',
      chartStart: '2 PM',
      chartEnd: '4 PM',
      avgPm25: 123,
    };
  }

  let minAvg = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < candidates.length - 1; i++) {
    const avg = (candidates[i].pm25 + candidates[i + 1].pm25) / 2;
    if (avg < minAvg) {
      minAvg = avg;
      bestIdx = i;
    }
  }

  const startPt = candidates[bestIdx];
  const endHour = (startPt.hour + 2) % 24;
  const startTime = formatHourFull(startPt.hour);
  const endTime = formatHourFull(endHour);
  const chartStart = formatHourShort(startPt.hour);
  const chartEnd = formatHourShort(endHour);

  return {
    startHour: startPt.hour,
    endHour,
    startTime,
    endTime,
    label: `${startTime} – ${endTime}`,
    shortLabel: `${chartStart}–${chartEnd}`,
    chartStart,
    chartEnd,
    avgPm25: Math.round(minAvg),
  };
}
