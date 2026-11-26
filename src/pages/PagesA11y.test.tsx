// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import '../lib/i18n';
import TodayPage from './TodayPage';
import ScanPage from './ScanPage';
import RoutesPage from './RoutesPage';
import CommunityPage from './CommunityPage';
import AskPage from './AskPage';
import OnboardingPage from './OnboardingPage';

vi.mock('../components/routes/RouteMap', () => ({
  default: () => <div role="region" aria-label="Route map preview" />,
}));

vi.mock('../lib/forecast', async () => {
  const actual = await vi.importActual<typeof import('../lib/forecast')>('../lib/forecast');
  return {
    ...actual,
    fetchSmartForecast: vi.fn().mockResolvedValue(actual.getOfflineFallbackForecast()),
    fetchOpenMeteoForecast: vi.fn().mockResolvedValue(actual.getOfflineFallbackForecast()),
  };
});

vi.mock('../lib/planFetcher', () => ({
  fetchDailyPlan: vi.fn().mockResolvedValue({
    plan: [
      {
        time: '7:30 AM',
        action: 'Keep windows shut',
        reason: 'Morning traffic peak',
        category: 'seal',
        before_pm25: 260,
        after_pm25: 130,
        hours: 3,
      },
    ],
    source: 'gemini',
  }),
  buildPlanDedupeKey: vi.fn().mockReturnValue('a11y-test-key'),
}));

vi.mock('../lib/communityService', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/communityService')>('../lib/communityService');
  return {
    ...actual,
    upsertTodayDailySavings: vi.fn().mockResolvedValue(undefined),
    getCurrentUserId: vi.fn().mockResolvedValue('a11y-user'),
    loadActiveGroup: vi.fn().mockResolvedValue(null),
  };
});

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

async function renderAndAudit(ui: React.ReactElement) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(ui);
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  expect(view.container.querySelectorAll('h1')).toHaveLength(1);
  const results = await axe(view.container, AXE_OPTIONS);
  expect(results.violations).toEqual([]);
}

describe('All 6 page components — heading hierarchy & axe accessibility', () => {
  let rafSpy: { mockRestore: () => void };

  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(performance.now() + 1000);
      return 0;
    });
  });

  afterEach(() => {
    cleanup();
    rafSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('TodayPage has a single H1 and zero axe violations', async () => {
    await renderAndAudit(
      <MemoryRouter>
        <main>
          <TodayPage />
        </main>
      </MemoryRouter>,
    );
  });

  it('ScanPage has a single H1 and zero axe violations', async () => {
    await renderAndAudit(
      <MemoryRouter>
        <main>
          <ScanPage />
        </main>
      </MemoryRouter>,
    );
  });

  it('RoutesPage has a single H1 and zero axe violations', async () => {
    await renderAndAudit(
      <MemoryRouter>
        <main>
          <RoutesPage />
        </main>
      </MemoryRouter>,
    );
  });

  it('CommunityPage (join/create view) has a single H1 and zero axe violations', async () => {
    await renderAndAudit(
      <MemoryRouter>
        <main>
          <CommunityPage />
        </main>
      </MemoryRouter>,
    );
  });

  it('AskPage has a single H1 and zero axe violations', async () => {
    await renderAndAudit(
      <MemoryRouter>
        <main>
          <AskPage />
        </main>
      </MemoryRouter>,
    );
  });

  it('OnboardingPage has a single H1 and zero axe violations', async () => {
    await renderAndAudit(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    );
  });
});
