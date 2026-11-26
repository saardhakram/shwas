// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import '../../lib/i18n';
import { TRANSLATION_FEEDBACK_URL } from '../../components/ui/TranslationNotice';
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

  it('displays the AI-assisted translation notice and GitHub feedback link', () => {
    render(<LanguageStep language="en" onSelectLanguage={vi.fn()} />);

    expect(screen.getByText(/Translations are AI-assisted\. Spot an error\?/i)).toBeTruthy();

    const feedbackLink = screen.getByRole('link', { name: /Let us know/i });
    expect(feedbackLink.getAttribute('href')).toBe(TRANSLATION_FEEDBACK_URL);
    expect(feedbackLink.getAttribute('target')).toBe('_blank');
    expect(feedbackLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('has zero axe accessibility violations', async () => {
    const { container } = render(<LanguageStep language="en" onSelectLanguage={vi.fn()} />);
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
