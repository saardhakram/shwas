/**
 * Types, prompt builder, and response parser/sanitizer for `/api/scan`.
 */

import { isRecord } from '../types.js';

export interface ScanRequestBody {
  image?: string;
  mimeType?: string;
  language?: string;
}

export interface ScanBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScanSourceItem {
  id: string;
  label: string;
  box: ScanBox;
  confidence?: number;
}

export interface ScanResponseBody {
  room: 'kitchen' | 'bedroom' | 'living' | 'balcony' | 'outdoor' | 'other';
  sources: ScanSourceItem[];
  source: 'gemini' | 'offline';
  message?: string;
}

const ALLOWED_SOURCE_IDS = new Set([
  'incense',
  'mosquito_coil',
  'gas_stove_no_chimney',
  'wood_or_coal_stove',
  'open_window_road',
  'candles',
  'smoking',
  'dust_carpet',
  'no_purifier',
  'cooler_no_filter',
  'burning_waste',
  'construction_dust',
  'other',
]);

const ALLOWED_ROOMS = new Set(['kitchen', 'bedroom', 'living', 'balcony', 'outdoor', 'other']);

export function buildScanPrompt(language: string): string {
  return `You are Shwas Vision, an expert computer vision system inspecting an indoor or outdoor living space for air pollution hazards in an Indian home.
Inspect this photo carefully. Detect the room type and any visible air quality risks or pollution sources.

ALLOWED SOURCE IDs:
- "incense": burning incense sticks / agarbatti / dhoop
- "mosquito_coil": burning mosquito coils or coil stands
- "gas_stove_no_chimney": gas burner or cooktop without overhead chimney or active exhaust
- "wood_or_coal_stove": traditional chulha, biomass burner, or coal burner
- "open_window_road": open window or balcony door facing traffic, road, or dusty exterior
- "candles": lit paraffin candles, diyas with excessive smoke
- "smoking": lit cigarettes, ashtray, bidi, or active smoke
- "dust_carpet": heavy unvacuumed carpet, thick dusty rugs, or visible dust layer
- "no_purifier": room without an active air purifier during high pollution
- "cooler_no_filter": desert cooler / air cooler drawing uncleaned air
- "burning_waste": visible smoke plume from leaf or trash burning outside window
- "construction_dust": construction dust, cement bags, or active renovation ingress
- "other": other visible particulate or smoke hazard

CRITICAL REQUIREMENTS:
1. Output MUST be a single strict JSON object matching this schema:
{
  "room": "kitchen" | "bedroom" | "living" | "balcony" | "outdoor" | "other",
  "sources": [
    {
      "id": "one of the allowed IDs above",
      "label": "Short name in ${language} (e.g. Incense / Agarbatti)",
      "box": {
        "x": 0.25,
        "y": 0.35,
        "w": 0.20,
        "h": 0.15
      },
      "confidence": 0.92
    }
  ]
}
2. "box" coordinates are normalized fractions between 0.0 and 1.0 (x = left fraction, y = top fraction, w = width fraction, h = height fraction).
3. If no pollution hazards are visible, return "sources": [].
4. "label" text MUST be in language: "${language}".`;
}

function clampFraction(val: unknown, fallback: number): number {
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

export function parseValidatedScanResponse(candidateText: string): {
  room: ScanResponseBody['room'];
  sources: ScanSourceItem[];
} {
  const cleanedJson = candidateText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const parsed: unknown = JSON.parse(cleanedJson);
  const parsedObj = isRecord(parsed) ? parsed : {};
  const roomStr = typeof parsedObj.room === 'string' ? parsedObj.room : 'other';
  const room = (ALLOWED_ROOMS.has(roomStr) ? roomStr : 'other') as ScanResponseBody['room'];
  const rawSources = Array.isArray(parsedObj.sources) ? parsedObj.sources : [];

  const sources: ScanSourceItem[] = rawSources
    .filter((s): s is Record<string, unknown> => isRecord(s))
    .map((s) => {
      const rawId = typeof s.id === 'string' ? s.id : 'other';
      const id = ALLOWED_SOURCE_IDS.has(rawId) ? rawId : 'other';
      const rawBox = isRecord(s.box) ? s.box : {};
      const x = clampFraction(rawBox.x, 0.2);
      const y = clampFraction(rawBox.y, 0.2);
      const w = clampFraction(rawBox.w, 0.3);
      const h = clampFraction(rawBox.h, 0.3);

      return {
        id,
        label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : id,
        box: {
          x: Number(x.toFixed(3)),
          y: Number(y.toFixed(3)),
          w: Number(Math.min(1 - x, w).toFixed(3)),
          h: Number(Math.min(1 - y, h).toFixed(3)),
        },
        confidence: typeof s.confidence === 'number' ? s.confidence : 0.85,
      };
    });

  return { room, sources };
}
