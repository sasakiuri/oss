// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { codedError } from '@/shared/errors/codedError';

describe('codedError', () => {
  it('is a plain Error with the given code and message', () => {
    const error = codedError('LANE_TIMER_RUN_BLOCKED', 'Competition timer operation is blocked');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('Error');
    expect(error.message).toBe('Competition timer operation is blocked');
    expect(error.code).toBe('LANE_TIMER_RUN_BLOCKED');
    expect(Object.keys(error)).toEqual(['code']);
  });
});
