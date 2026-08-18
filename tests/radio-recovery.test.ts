import { describe, expect, it } from 'vitest';

import { calculateReconnectDelay } from '../src/radio/radio-session.js';

describe('calculateReconnectDelay', () => {
  it('aumenta progressivamente sem ultrapassar o limite', () => {
    expect(calculateReconnectDelay(3_000, 60_000, 6, 1)).toBe(3_000);
    expect(calculateReconnectDelay(3_000, 60_000, 6, 2)).toBe(6_000);
    expect(calculateReconnectDelay(3_000, 60_000, 6, 6)).toBe(60_000);
    expect(calculateReconnectDelay(3_000, 60_000, 6, 50)).toBe(60_000);
  });
});
