// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { useCommunityGroup } from './useCommunityGroup';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
}));

describe('useCommunityGroup hook family', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a group, posts a local alert, copies join code, opens share modal, and leaves group', async () => {
    const { result } = renderHook(() => useCommunityGroup());

    await waitFor(() => {
      expect(result.current.currentUserId).not.toBe('');
    });
    expect(result.current.activeGroup).toBeNull();

    // Validation error on short group name
    await act(async () => {
      await result.current.handleCreateGroup({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.formError).toBeTruthy();

    // Create a valid group
    act(() => {
      result.current.setGroupNameInput('Vasant Vihar Green');
    });
    await act(async () => {
      await result.current.handleCreateGroup({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    await waitFor(() => {
      expect(result.current.activeGroup?.name).toBe('Vasant Vihar Green');
    });

    // Copy join code
    await act(async () => {
      await result.current.handleCopyCode();
    });
    expect(result.current.copiedCode).toBe(true);

    // Report a local alert
    act(() => {
      result.current.setShowReportForm(true);
      result.current.setAlertMessage('Garbage burning near Gate 3');
    });
    await act(async () => {
      await result.current.handleReportSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.alerts.some((a) => a.message.includes('Gate 3'))).toBe(true);
    expect(result.current.showReportForm).toBe(false);

    // Open share modal
    act(() => {
      result.current.handleOpenShare();
    });
    expect(result.current.showShareModal).toBe(true);

    // Leave group resets active state
    act(() => {
      result.current.handleLeaveGroup();
    });
    expect(result.current.activeGroup).toBeNull();
  });

  it('joins the Green Park Society demo group with populated leaderboard and alerts', async () => {
    const { result } = renderHook(() => useCommunityGroup());

    await act(async () => {
      await result.current.handleJoinDemo();
    });

    await waitFor(() => {
      expect(result.current.activeGroup?.join_code).toBe('GRNPK6');
      expect(result.current.weeklyStats.leaderboard.length).toBeGreaterThan(0);
    });
  });
});
