-- Production reference catalog.
-- Intentionally excludes representative development curriculum_nodes.

insert into public.exams (id, code, name, level, is_active)
values (
  '10000000-0000-0000-0000-000000000001',
  'KPSS_LISANS',
  'KPSS Lisans',
  'lisans',
  true
)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  level = excluded.level,
  is_active = excluded.is_active;

insert into public.exam_editions (id, exam_id, year, exam_date, status)
values (
  '11000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  2026,
  null,
  'active'
)
on conflict (id) do update set
  exam_id = excluded.exam_id,
  year = excluded.year,
  exam_date = excluded.exam_date,
  status = excluded.status;

insert into public.subjects (id, code, name, category, sort_order, is_active)
values
  ('20000000-0000-0000-0000-000000000001', 'TURKCE', 'Türkçe', 'genel_yetenek_genel_kultur', 1, true),
  ('20000000-0000-0000-0000-000000000002', 'MATEMATIK', 'Matematik', 'genel_yetenek_genel_kultur', 2, true),
  ('20000000-0000-0000-0000-000000000003', 'TARIH', 'Tarih', 'genel_yetenek_genel_kultur', 3, true),
  ('20000000-0000-0000-0000-000000000004', 'COGRAFYA', 'Coğrafya', 'genel_yetenek_genel_kultur', 4, true),
  ('20000000-0000-0000-0000-000000000005', 'VATANDASLIK', 'Vatandaşlık', 'genel_yetenek_genel_kultur', 5, true),
  ('20000000-0000-0000-0000-000000000006', 'HUKUK', 'Hukuk', 'alan_bilgisi', 6, true),
  ('20000000-0000-0000-0000-000000000007', 'IKTISAT', 'İktisat', 'alan_bilgisi', 7, true),
  ('20000000-0000-0000-0000-000000000008', 'MALIYE', 'Maliye', 'alan_bilgisi', 8, true),
  ('20000000-0000-0000-0000-000000000009', 'MUHASEBE', 'Muhasebe', 'alan_bilgisi', 9, true),
  ('20000000-0000-0000-0000-000000000010', 'ISLETME', 'İşletme', 'alan_bilgisi', 10, true),
  ('20000000-0000-0000-0000-000000000011', 'KAMU_YONETIMI', 'Kamu Yönetimi', 'alan_bilgisi', 11, true),
  ('20000000-0000-0000-0000-000000000012', 'ULUSLARARASI_ILISKILER', 'Uluslararası İlişkiler', 'alan_bilgisi', 12, true),
  ('20000000-0000-0000-0000-000000000013', 'CALISMA_EKONOMISI_VE_ENDUSTRI_ILISKILERI', 'Çalışma Ekonomisi ve Endüstri İlişkileri', 'alan_bilgisi', 13, true),
  ('20000000-0000-0000-0000-000000000014', 'ISTATISTIK', 'İstatistik', 'alan_bilgisi', 14, true)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.exam_subjects (id, exam_id, subject_id, is_optional, sort_order)
values
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false, 1),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', false, 2),
  ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', false, 3),
  ('21000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', false, 4),
  ('21000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', false, 5),
  ('21000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', true, 6),
  ('21000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000007', true, 7),
  ('21000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000008', true, 8),
  ('21000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', true, 9),
  ('21000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000010', true, 10),
  ('21000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', true, 11),
  ('21000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000012', true, 12),
  ('21000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000013', true, 13),
  ('21000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', true, 14)
on conflict (id) do update set
  exam_id = excluded.exam_id,
  subject_id = excluded.subject_id,
  is_optional = excluded.is_optional,
  sort_order = excluded.sort_order;