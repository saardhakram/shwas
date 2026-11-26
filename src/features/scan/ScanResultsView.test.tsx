// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import { ScanResultsView } from './ScanResultsView';
import type { ComputedFix } from '../../lib/fixes';

const SAMPLE_FIX: ComputedFix = {
  id: 'incense',
  label: 'Agarbatti Smoke',
  category: 'routine',
  why: 'Burning incense releases dense fine particulates indoors.',
  fix: 'Switch to electric diffusers or burn near an open balcony.',
  reductionPercent: 35,
  beforePm25: 220,
  afterPm25: 143,
  cigarettesSaved: 0.7,
  box: { x: 0.2, y: 0.3, w: 0.2, h: 0.2 },
};

describe('ScanResultsView component', () => {
  afterEach(() => cleanup());

  it('renders hotspots, selects fixes, triggers Add to Plan, and handles Retake', async () => {
    const user = userEvent.setup();
    const onSelectFix = vi.fn();
    const onAddToPlan = vi.fn();
    const onRetake = vi.fn();

    render(
      <ScanResultsView
        imagePreview="data:image/jpeg;base64,preview"
        detectedRoom="living"
        computedFixes={[SAMPLE_FIX]}
        totalSaved={0.7}
        selectedFixId="incense"
        addedFixIds={{}}
        errorMessage="Offline mode fallback notice"
        scanSource="offline"
        onSelectFix={onSelectFix}
        onAddToPlan={onAddToPlan}
        onRetake={onRetake}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Offline mode fallback notice');
    expect(screen.getByText(/Room: living/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Hotspot: Agarbatti Smoke/i }));
    expect(onSelectFix).toHaveBeenCalledWith('incense');

    await user.click(screen.getByRole('button', { name: /Add Agarbatti Smoke fix/i }));
    expect(onAddToPlan).toHaveBeenCalledWith(SAMPLE_FIX);

    await user.click(screen.getByRole('button', { name: /Retake/i }));
    expect(onRetake).toHaveBeenCalledTimes(1);
  });
});
