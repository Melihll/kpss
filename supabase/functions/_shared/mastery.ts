import {
  buildRevisionDecision,
  evaluateTopicMastery,
  getRevisionUrgency,
} from "./planning.bundle.js";

type Client = any;

export function istanbulCalendarDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

export function revisionWithUrgency<T extends { scheduled_for: string }>(revision: T, today = istanbulCalendarDate()) {
  return { ...revision, urgency: getRevisionUrgency(revision.scheduled_for, today) };
}

export async function recalculateTopicMastery(
  client: Client,
  input: {
    userId: string;
    examProfileId: string;
    curriculumNodeId: string;
    sourceTestResultId: string;
    triggerType: "test_result" | "revision_result" | "manual_recalculation";
    serviceRole?: boolean;
  },
) {
  const [progressResult, resultsResult, sourceResult, schedulesResult] = await Promise.all([
    client.from("topic_progress")
      .select("state,mastery_level,total_questions,last_practiced_at")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("curriculum_node_id", input.curriculumNodeId)
      .single(),
    client.from("test_results")
      .select("id,correct_count,wrong_count,blank_count,total_questions,completed_at,review_status,updated_at")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("curriculum_node_id", input.curriculumNodeId)
      .order("completed_at", { ascending: false })
      .limit(3),
    client.from("test_results")
      .select("id,updated_at")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("id", input.sourceTestResultId)
      .single(),
    client.from("revision_schedules")
      .select("id,status,revision_number,scheduled_for")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("curriculum_node_id", input.curriculumNodeId),
  ]);
  for (const result of [progressResult, resultsResult, sourceResult, schedulesResult]) if (result.error) throw result.error;
  const source = sourceResult.data;

  const assessment = evaluateTopicMastery({
    recentTestResults: (resultsResult.data ?? []).map((row: any) => ({
      correct: row.correct_count,
      wrong: row.wrong_count,
      blank: row.blank_count,
      total: row.total_questions,
      completedAt: row.completed_at,
    })),
    totalQuestionCount: progressResult.data.total_questions,
    currentMasteryLevel: progressResult.data.mastery_level,
    topicState: progressResult.data.state,
  });
  const revision = buildRevisionDecision({
    masteryLevel: assessment.resultingMasteryLevel,
    topicState: assessment.resultingTopicState,
    latestAssessment: assessment,
    previousRevisionSchedules: (schedulesResult.data ?? []).map((row: any) => ({
      id: row.id,
      status: row.status,
      revisionNumber: row.revision_number,
      scheduledFor: row.scheduled_for,
    })),
    lastPracticedAt: progressResult.data.last_practiced_at,
    pendingWrongReview: (resultsResult.data ?? []).some((row: any) => row.review_status === "pending"),
    today: istanbulCalendarDate(),
  });
  const payload = {
    examProfileId: input.examProfileId,
    curriculumNodeId: input.curriculumNodeId,
    triggerType: input.triggerType,
    sourceTestResultId: source.id,
    sourceResultUpdatedAt: source.updated_at,
    sampleQuestionCount: assessment.sampleQuestionCount,
    sampleCorrectCount: assessment.sampleCorrectCount,
    sampleWrongCount: assessment.sampleWrongCount,
    sampleBlankCount: assessment.sampleBlankCount,
    previousMasteryLevel: assessment.previousMasteryLevel,
    resultingMasteryLevel: assessment.resultingMasteryLevel,
    resultingTopicState: assessment.resultingTopicState,
    assessmentReason: assessment.reason,
    revision,
  };
  const applied = input.serviceRole
    ? await client.rpc("telegram_apply_topic_mastery_assessment", { p_user_id: input.userId, p_payload: payload })
    : await client.rpc("apply_topic_mastery_assessment", { p_payload: payload });
  if (applied.error) throw applied.error;
  return applied.data;
}
