// Explicit test fixture only. Never use the retired bootstrap to seed choices.
export async function createLocalP48PilotFixture(api, { url, userId, profileId }) {
  if (url !== 'http://127.0.0.1:54321') throw Error('LOCAL_FIXTURE_URL_REQUIRED');
  const check = async query => { const result = await query; if (result.error) throw result.error; return result.data; };
  const profile = await check(api.from('exam_profiles').select('id,user_id').eq('id', profileId).single());
  if (profile.user_id !== userId) throw Error('INVALID_EXAM_PROFILE_OWNERSHIP');
  const existing = await check(api.from('p48_strategy_profiles').select('id').eq('exam_profile_id', profileId));
  if (existing.length) throw Error('FIXTURE_REQUIRES_UNCONFIGURED_PROFILE');
  const subjects = Array.from({ length: 9 }, (_, n) => `20000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`);
  await check(api.from('user_subjects').insert(subjects.map(subject_id => ({ user_id: userId, exam_profile_id: profileId, subject_id, status: 'active' }))));
  await check(api.from('p48_strategy_profiles').insert({ user_id: userId, exam_profile_id: profileId, score_type: 'KPSSP48', target_exam_date: '2027-09-06', weekly_target_minutes: 1800, monthly_target_minutes: 7200, status: 'active', source_note: 'Explicit disposable LOCAL pilot regression fixture' }));
  const state = await check(api.rpc('weekly_availability_state', { p_exam_profile_id: profileId }));
  await check(api.rpc('replace_weekly_availability', { p_exam_profile_id: profileId, p_expected_revision: state.revision, p_windows: subjects.slice(0, 7).map((_, i) => ({ weekday: i + 1, start_time: i < 5 ? '18:00' : '13:00', end_time: i < 5 ? '22:00' : '18:00', label: 'Explicit LOCAL pilot fixture' })) }));
  await check(api.from('calendar_periods').insert([
    ['midterm', 'Güz Vize', '2026-11-09', '2026-11-15'], ['final', 'Güz Final', '2027-01-04', '2027-01-17'],
    ['midterm', 'Bahar Vize', '2027-04-05', '2027-04-11'], ['final', 'Bahar Final', '2027-06-07', '2027-06-20'],
  ].map(([period_type, name, start_date, end_date]) => ({ user_id: userId, exam_profile_id: profileId, period_type, name: `P48 Tahmini ${name}`, start_date, end_date, capacity_multiplier: 0 }))));
  const refs = await check(api.from('p48_reference_resources').select('*').eq('is_active', true).order('sequence_order'));
  for (const ref of refs) {
    const resource = await check(api.from('resources').insert({ user_id: userId, exam_profile_id: profileId, subject_id: ref.subject_id, name: ref.name, publisher: ref.publisher, resource_type: ref.resource_type, resource_role: ref.resource_role, difficulty: 'normal', status: 'active' }).select('id').single());
    await check(api.from('p48_resource_targets').insert({ user_id: userId, exam_profile_id: profileId, resource_id: resource.id, reference_resource_id: ref.id, planned_minutes: ref.planned_minutes, sequence_order: ref.sequence_order, work_mode: ref.work_mode }));
  }
  return { subjects: subjects.length, resources: refs.length };
}
