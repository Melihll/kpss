import { describe, expect, it } from 'vitest';
import { availabilityValidationMessage, availabilitySaveMessage } from './weekly-availability';
const window = { weekday: 2, start_time: '07:15', end_time: '08:15' };
describe('availability replacement input and failure honesty', () => {
  it('accepts empty and adjacent windows', () => {
    expect(availabilityValidationMessage([])).toBeNull();
    expect(availabilityValidationMessage([window, { ...window, start_time: '08:15', end_time: '09:15' }])).toBeNull();
  });
  it.each([
    [{ ...window, weekday: 0 }], [{ ...window, weekday: 1.5 }], [{ ...window, start_time: '25:00' }],
    [{ ...window, start_time: '08:15' }], [{ ...window, end_time: '06:15' }],
    [window, { ...window, start_time: '07:30', is_active: false }],
  ])('rejects invalid or overlapping input %j', (...windows) => expect(availabilityValidationMessage(windows)).not.toBeNull());
  it('does not promise rollback after an ambiguous transport error', () => {
    expect(availabilitySaveMessage('fetch failed')).toContain('kontrol et');
    expect(availabilitySaveMessage('AVAILABILITY_CONFLICT')).toContain('başka bir işlemde');
  });
});
