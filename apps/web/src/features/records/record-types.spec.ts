import { describe, expect, it } from 'vitest';
import { RECORD_API_RESOURCES } from './record-types';

describe('RECORD_API_RESOURCES', () => {
  it('maps company records to the companies API endpoint', () => {
    expect(RECORD_API_RESOURCES.company).toBe('companies');
  });
});
