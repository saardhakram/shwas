// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import '../../lib/i18n';
import { LanguageStep } from './LanguageStep';

describe('LanguageStep', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders language tiles and selects a language on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<LanguageStep language="en" onSelectLanguage={onSelect} />);

    const englishBtn = screen.getByRole('button', { name: /English/i });
    const hindiBtn = screen.getByRole('button', { name: /Hindi/i });

    expect(englishBtn.getAttribute('aria-pressed')).toBe('true');
    expect(hindiBtn.getAttribute('aria-pressed')).toBe('false');

    await user.click(hindiBtn);
    expect(onSelect).toHaveBeenCalledWith('hi');
  });

  it('has zero axe accessibility violations', async () => {
    const { container } = render(<LanguageStep language="en" onSelectLanguage={vi.fn()} />);
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
