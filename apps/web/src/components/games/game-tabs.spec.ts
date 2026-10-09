import { describe, expect, it } from 'vitest';
import { GAME_TABS } from './game-tabs';

describe('GAME_TABS', () => {
  it('puts API keys between Leaderboards and Settings', () => {
    expect(GAME_TABS).toEqual([
      { segment: '', label: 'Overview' },
      { segment: 'leaderboards', label: 'Leaderboards' },
      { segment: 'keys', label: 'API keys' },
      { segment: 'settings', label: 'Settings' },
    ]);
  });
});
