import { describe, expect, it } from 'vitest';
import { currentCustomFieldValues } from './custom-field-values';

describe('currentCustomFieldValues', () => {
  it('omits orphaned fields while preserving values for current definitions', () => {
    expect(
      currentCustomFieldValues(
        { priority: 0, active: false, deletedField: 'stale' },
        [{ key: 'priority' }, { key: 'active' }],
      ),
    ).toEqual({ priority: 0, active: false });
  });
});
