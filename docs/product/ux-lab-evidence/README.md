# UX Lab — browser acceptance

Date: 2026-10-01. Local Vite server: `http://127.0.0.1:5174`. No login or backend used.

`responsive-checks.json` records the 54 route/viewport measurements. Screenshots show the three desktop directions and mobile resource/session/week/Coach layouts. These are demonstration data, not real student records.

## Repeatable smoke checklist

1. Open `/ux-lab/today?concept=product`. Switch A/B/C without reloading; the selected concept and data should persist while navigating.
2. Start Muhasebe. Pause and verify the clock stops; resume, finish, enter page 142 and save. Confirm “Sayfa 142”, the next task, 2/4 completed work and 142/480 resource progress. Repeat the flow in Focus and Coach.
3. Start another task and finish with no new page. Time is retained; task is not completed. Resume a partial task and attempt an earlier page; the field must reject reversal.
4. In Coach choose “Yarın daha az vaktim var”. No plan changes before review. Inspect Cuma → Cumartesi and 60 → 45 minutes; cancel once, review again and update. Inspect Week for the two exact changes.
5. In Week add a 20-minute task for today. Inspect the review and confirm. Edit to another day and 25 minutes, then cancel; verify the original is retained. Remove it through review/confirmation.
6. Reduce today's capacity below planned work. Verify a clear explanation and unavailable update. Use a sufficient capacity and verify the daily and weekly totals change.
7. Open Resources → İktisat → İzlemeye devam et. Check loading skeleton, current video time, separate 12/91 playlist progress, play/pause and seek. Close with Escape and verify focus returns to the opener.
8. Select loading, empty, error and unavailable-operation scenarios in the evaluation toolbar. Use Normal durum to exit loading and Tekrar dene for the error state. A blocked proposal must explain the problem, preserve the plan and allow returning.
9. Tab/Shift+Tab around a dialog. Focus stays inside; Escape closes it and restores focus. During saving, dismissal is unavailable until completion. In the session, Escape opens the finish flow, without discarding study time.
10. Open Today/Week/Coach/Roadmap/Resources/Progress for all concepts at 1440×900, 834×1112 and 390×844. Verify no horizontal page overflow; mobile Week exposes one day with all task actions and mobile navigation remains usable.

## Automated regression scope

`apps/web/src/ux-lab/model.test.ts` covers immutable review, explicit apply, stale/repeat apply rejection, partial progress, no-progress recording, boundary validation, video completion, capacity conflicts, add/edit/remove and preservation of study records.

`node scripts/check-ux-lab.mjs` checks strict unused declarations and the offline dependency boundary. Existing full regression and safety checks remain authoritative for the real application. The browser checklist above uses the development prototype only; it must never be pointed at real data or treated as permission to enable production mutations.
