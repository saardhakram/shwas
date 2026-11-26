import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processAskRequest,
  clearAskRateLimitForTesting,
  DAILY_QUESTION_LIMIT,
  buildTimeMiniCard,
} from './ask.js';
import type { UserProfile } from '../src/types/index.js';
import type { ForecastDataPoint } from '../src/shared/forecastWindow.js';

describe('Serverless Ask Shwas API (/api/ask)', () => {
  const originalFetch = global.fetch;

  const sampleProfile: UserProfile = {
    id: 'user-ask-1',
    language: 'en',
    location: { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
    family: [
      {
        id: 'dadi',
        name: 'Dadi',
        age: 72,
        flags: { heart: true },
        routine: { hoursOutside: 1, hoursAway: 0 },
      },
      {
        id: 'aarav',
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
    },
  };

  const sampleForecast: ForecastDataPoint[] = [
    {
      isoTime: '2026-11-26T14:00:00+05:30',
      timestamp: Date.now(),
      time: '2 PM',
      fullTime: '2:00 PM',
      hour: 14,
      day: 'Today',
      pm25: 110,
      usAqi: 179,
      aqi: 179,
      isPast: false,
    },
    {
      isoTime: '2026-11-26T18:00:00+05:30',
      timestamp: Date.now() + 4 * 3600 * 1000,
      time: '6 PM',
      fullTime: '6:00 PM',
      hour: 18,
      day: 'Today',
      pm25: 264,
      usAqi: 314,
      aqi: 314,
      isPast: false,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAskRateLimitForTesting();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends profile, forecast, plan, and safety instructions to Gemini and computes inline mini-card in code', async () => {
    let capturedPrompt = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedGenConfig: Record<string, any> = {};

    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedHeaders = opts.headers;
      const body = JSON.parse(opts.body);
      capturedPrompt = body.contents[0].parts[0].text;
      capturedGenConfig = body.generationConfig;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      answer:
                        '6 PM has heavy smog (AQI 314), so it is safer for Dadi to walk at 2 PM instead when the air is cleaner.',
                      timeMentioned: '6:00 PM',
                      targetHour: 18,
                      durationHours: 1,
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const res = await processAskRequest(
      {
        question: 'Can Dadi walk at 6 PM?',
        userId: 'user-ask-1',
        profile: sampleProfile,
        currentPm25: 180,
        currentAqi: 230,
        forecast: sampleForecast,
        plan: [
          {
            time: '2:00 PM',
            action: 'Air out rooms during clean window',
            reason: 'Lowest PM2.5 of day',
            category: 'ventilate',
            before_pm25: 180,
            after_pm25: 110,
          },
        ],
      },
      'mock-gemini-key',
    );

    expect(capturedHeaders['x-goog-api-key']).toBe('mock-gemini-key');
    expect(capturedGenConfig.maxOutputTokens).toBe(500);
    expect(capturedGenConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(capturedPrompt).toContain('Dadi (age 72, heart condition');
    expect(capturedPrompt).toContain('Aarav (age 8, asthma');
    expect(capturedPrompt).toContain('6:00 PM(Today):PM2.5=264,AQI=314');
    expect(capturedPrompt).toContain('Air out rooms during clean window');
    expect(capturedPrompt).toContain('NEVER give medical diagnoses');
    expect(capturedPrompt).toContain('Politely refuse unrelated topics');

    expect(res.source).toBe('gemini');
    expect(res.remainingToday).toBe(DAILY_QUESTION_LIMIT - 1);
    expect(res.miniCard).not.toBeNull();
    expect(res.miniCard!.timeLabel).toBe('6:00 PM');
    expect(res.miniCard!.aqi).toBe(314);
    expect(res.miniCard!.pm25).toBe(264);
    // 264 * 1h / 528 = 0.50 cigarettes
    expect(res.miniCard!.cigarettes).toBe(0.5);
    expect(res.miniCard!.level).toBe('high');
  });

  it('enforces 20 questions per user per day limit without calling Gemini on the 21st question', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ answer: 'Short tip.', targetHour: null }) }],
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock;

    for (let i = 0; i < DAILY_QUESTION_LIMIT; i++) {
      const r = await processAskRequest(
        { question: `Question ${i + 1}`, userId: 'limit-user', profile: sampleProfile },
        'mock-key',
      );
      expect(r.source).toBe('gemini');
      expect(r.remainingToday).toBe(DAILY_QUESTION_LIMIT - (i + 1));
    }

    expect(fetchMock).toHaveBeenCalledTimes(DAILY_QUESTION_LIMIT);

    // 21st question must be blocked immediately
    const blocked = await processAskRequest(
      { question: 'Question 21', userId: 'limit-user', profile: sampleProfile },
      'mock-key',
    );
    expect(blocked.source).toBe('rate_limited');
    expect(blocked.error).toBe('daily_limit_reached');
    expect(blocked.remainingToday).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(DAILY_QUESTION_LIMIT);
  });

  it('returns a friendly fallback message when Gemini fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const res = await processAskRequest(
      { question: 'Best mask for kids?', userId: 'user-err', profile: sampleProfile },
      'bad-key',
    );

    expect(res.source).toBe('offline');
    expect(res.answer).toContain('Sorry');
    expect(res.answer).toContain('doctor');
  });

  it('returns null mini-card when no specific time is referenced', () => {
    expect(buildTimeMiniCard(null, null, null, sampleForecast, 180, 230)).toBeNull();
  });
});
