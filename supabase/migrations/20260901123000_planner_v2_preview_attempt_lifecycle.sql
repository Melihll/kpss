begin;

-- A deterministic Planner V2 proposal may be previewed more than once over
-- its lifetime. The proposal identity remains deterministic, while each
-- manual preview request receives its own confirmed_action_proposals record.
--
-- Terminal lifecycle rows (expired/stale/rejected/applied) are never revived.

drop index if exists public.confirmed_action_proposals_planner_identity_unique;

create index if not exists confirmed_action_proposals_planner_identity_idx
on public.confirmed_action_proposals (
  user_id,
  planner_proposal_id,
  created_at desc
)
where action_kind = 'planner_v2_week';

commit;
