import { describe, expect, it } from 'vitest';
import { p48GenerationReadiness } from '../supabase/functions/_shared/p48-generation-readiness';
const valid = { targetExamDate: '2027-12-21', availableMinutes: 120, selectedSubjectIds: ['math'], resources: [{ subject_id: 'math', status: 'active' }] };
describe('explicit legacy P48 generation eligibility', () => {
  it('accepts selected active resources with positive capacity', () => expect(p48GenerationReadiness(valid)).toEqual({ ready: true, reason: null }));
  it.each([
    [{ targetExamDate: null }, 'P48_EXAM_DATE_REQUIRED'], [{ selectedSubjectIds: [] }, 'P48_SUBJECTS_REQUIRED'],
    [{ availableMinutes: 0 }, 'P48_CAPACITY_SOURCE_MISSING'], [{ resources: [] }, 'P48_RESOURCES_REQUIRED'],
    [{ resources: [{ subject_id: 'math', status: 'paused' }] }, 'P48_RESOURCES_REQUIRED'],
    [{ resources: [{ subject_id: 'unselected', status: 'active' }] }, 'P48_RESOURCES_REQUIRED'],
  ])('rejects %j', (change, reason) => expect(p48GenerationReadiness({ ...valid, ...change })).toEqual({ ready: false, reason }));
});
