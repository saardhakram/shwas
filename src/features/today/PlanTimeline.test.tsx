// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import { PlanTimeline } from './PlanTimeline';
import type { AirPlanItem } from '../../types';

const SAMPLE_ITEMS: AirPlanItem[] = [
  {
    id: 'plan_1',
    time: '7:30 AM',
    action: 'Keep road-facing windows shut',
    reason: 'Morning diesel peak',
    category: 'seal',
    before_pm25: 280,
    after_pm25: 130,
    hours: 3,
    cigarettesSaved: 0.9,
    completed: false,
  },
  {
    id: 'plan_2',
    time: '2:00 PM',
    action: 'Cross-ventilate living room',
    reason: 'Cleanest afternoon window',
    category: 'ventilate',
    before_pm25: 180,
    after_pm25: 110,
    hours: 1,
    cigarettesSaved: 0.2,
    completed: true,
  },
];

describe('PlanTimeline component', () => {
  afterEach(() => cleanup());

  it('renders Gemini badge, item savings, and toggles items on click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <PlanTimeline
        planItems={SAMPLE_ITEMS}
        isPlanLoading={false}
        isStillThinking={false}
        planSource="gemini"
        checkedSavings={0.2}
        totalPotentialSavings={1.1}
        onToggleItem={onToggle}
      />,
    );

    expect(screen.getByText('Gemini')).toBeTruthy();
    expect(screen.getByText('Plan by Gemini')).toBeTruthy();
    expect(screen.getByText('0.2 cigs saved so far')).toBeTruthy();
    expect(screen.getByText('7:30 AM')).toBeTruthy();

    const firstCheckbox = screen.getByRole('checkbox', {
      name: /Mark complete: Keep road-facing windows shut/i,
    });
    expect(firstCheckbox.getAttribute('aria-checked')).toBe('false');

    await user.click(firstCheckbox);
    expect(onToggle).toHaveBeenCalledWith('plan_1');
  });

  it('renders loading and still-thinking status when plan is generating', () => {
    const { rerender } = render(
      <PlanTimeline
        planItems={SAMPLE_ITEMS}
        isPlanLoading={true}
        isStillThinking={false}
        planSource="offline"
        checkedSavings={0}
        totalPotentialSavings={1.1}
        onToggleItem={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Generating...').length).toBeGreaterThan(0);

    rerender(
      <PlanTimeline
        planItems={SAMPLE_ITEMS}
        isPlanLoading={true}
        isStillThinking={true}
        planSource="offline"
        checkedSavings={0}
        totalPotentialSavings={1.1}
        onToggleItem={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Still thinking…').length).toBeGreaterThan(0);
  });
});
