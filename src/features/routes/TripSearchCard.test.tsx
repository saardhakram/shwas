// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import { TripSearchCard } from './TripSearchCard';

const PRESETS = {
  home: { name: 'South Delhi', lat: 28.56, lon: 77.18 },
  school: { name: 'Modern School', lat: 28.62, lon: 77.23 },
  office: { name: 'Cyber Hub', lat: 28.49, lon: 77.08 },
};

describe('TripSearchCard component', () => {
  afterEach(() => cleanup());

  it('supports searching, selecting suggestions, clicking quick chips, and choosing custom time', async () => {
    const user = userEvent.setup();
    const onDestSearch = vi.fn();
    const onSelectDest = vi.fn();
    const onChipClick = vi.fn();
    const onDeparturePresetChange = vi.fn();
    const onCustomTimeChange = vi.fn();

    const suggestion = { name: 'Connaught Place', subtitle: 'New Delhi', lat: 28.63, lon: 77.21 };

    const { rerender } = render(
      <TripSearchCard
        quickPresets={PRESETS}
        originInput="South Delhi"
        originSuggestions={[]}
        destination={null}
        destInput="Connaught"
        destSuggestions={[suggestion]}
        isSearchingTo={false}
        departurePreset="now"
        customTime="14:30"
        onOriginSearch={vi.fn()}
        onSelectOrigin={vi.fn()}
        onDestSearch={onDestSearch}
        onSelectDest={onSelectDest}
        onClearDest={vi.fn()}
        onChipClick={onChipClick}
        onDeparturePresetChange={onDeparturePresetChange}
        onCustomTimeChange={onCustomTimeChange}
      />,
    );

    await user.click(screen.getByText('Connaught Place'));
    expect(onSelectDest).toHaveBeenCalledWith(suggestion);

    await user.click(screen.getByRole('button', { name: /Set destination to School/i }));
    expect(onChipClick).toHaveBeenCalledWith('school');

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    expect(onDeparturePresetChange).toHaveBeenCalledWith('custom');

    rerender(
      <TripSearchCard
        quickPresets={PRESETS}
        originInput="South Delhi"
        originSuggestions={[]}
        destination={PRESETS.school}
        destInput="Modern School"
        destSuggestions={[]}
        isSearchingTo={false}
        departurePreset="custom"
        customTime="14:30"
        onOriginSearch={vi.fn()}
        onSelectOrigin={vi.fn()}
        onDestSearch={onDestSearch}
        onSelectDest={onSelectDest}
        onClearDest={vi.fn()}
        onChipClick={onChipClick}
        onDeparturePresetChange={onDeparturePresetChange}
        onCustomTimeChange={onCustomTimeChange}
      />,
    );

    expect(screen.getByLabelText(/Custom departure time/i)).toBeTruthy();
  });
});
