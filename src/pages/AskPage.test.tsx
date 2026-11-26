// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import '../lib/i18n';
import { AskPage } from './AskPage';

describe('AskPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('sends a question to /api/ask and renders the reply and exposure mini-card', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/ask')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            answer: 'Air quality at 6 PM is poor, so prefer an indoor walk today.',
            source: 'gemini',
            remainingToday: 19,
            miniCard: {
              timeLabel: '6:00 PM',
              aqi: 245,
              pm25: 195,
              cigarettes: 0.37,
              durationHours: 1,
              level: 'high',
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hourly: {
            time: ['2026-11-26T14:00'],
            pm2_5: [120],
            us_aqi: [185],
          },
        }),
      };
    });

    render(<AskPage />);

    const input = screen.getByLabelText('Ask Shwas an air quality question');
    await user.type(input, 'Can I walk at 6 PM?');
    await user.click(screen.getByRole('button', { name: 'Send question' }));

    await waitFor(() => {
      expect(
        screen.getByText('Air quality at 6 PM is poor, so prefer an indoor walk today.'),
      ).toBeTruthy();
    });

    expect(screen.getByText('AQI 245')).toBeTruthy();
    expect(screen.getByText('0.37 cigs')).toBeTruthy();
    expect(screen.getByText('19/20 left')).toBeTruthy();
  });

  it('has zero axe accessibility violations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hourly: { time: [], pm2_5: [], us_aqi: [] } }),
    });
    global.fetch = fetchMock;

    const { container } = render(<AskPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
