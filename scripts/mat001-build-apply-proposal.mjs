import fs from "node:fs";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  throw new Error("Usage: node mat001-build-apply-proposal.mjs INPUT OUTPUT");
}

const rawText = fs
  .readFileSync(inputPath, "utf8")
  .replace(/^\uFEFF/, "");

const manifest = JSON.parse(rawText);

if (manifest.writesAllowed !== false) {
  throw new Error("Input manifest must be candidate-only");
}

const youtubeProposed = manifest.videos
  .filter((video) => video.status === "single_candidate")
  .map((video) => {
    if (video.candidates.length !== 1) {
      throw new Error(`Single candidate video ${video.videoId} does not have exactly one candidate`);
    }

    const candidate = video.candidates[0];

    if (!candidate.curriculumNodeId) {
      throw new Error(`Single candidate video ${video.videoId} has no curriculum node`);
    }

    return {
      videoId: video.videoId,
      position: video.position,
      title: video.title,
      durationSeconds: video.durationSeconds,
      curriculumNodeId: candidate.curriculumNodeId,
      curriculumTopic: candidate.name,
      segmentStartSeconds: null,
      segmentEndSeconds: null,
      proposedMappingStatus: "validated",
      proposedMappingProvenance: "reviewed_mapping",
      activationCondition: "explicit_human_batch_review",
    };
  });

const youtubeHeld = manifest.videos
  .filter((video) => video.status !== "single_candidate")
  .map((video) => ({
    videoId: video.videoId,
    position: video.position,
    title: video.title,
    status: video.status,
    reason: video.reason,
    candidates: video.candidates,
  }));

const physicalProposed = manifest.physicalCandidates
  .filter((candidate) => candidate.candidate_status === "exact_unit_candidate")
  .map((candidate) => {
    const start = candidate.page_start;
    const end = candidate.page_end;

    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      throw new Error(`Invalid physical range for section ${candidate.section_id}`);
    }

    return {
      resourceId: candidate.resource_id,
      resourceName: candidate.resource_name,
      sectionId: candidate.section_id,
      sectionName: candidate.section_name,
      curriculumNodeId: candidate.curriculum_node_id,
      curriculumTopic: candidate.curriculum_topic,
      pageStart: start,
      pageEnd: end,
      pageCount: end - start + 1,
      sourceUnitType: candidate.source_unit_type,
      planningRole: candidate.planning_role,
      basis: candidate.basis,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      physicalRange: candidate.physical_range,
      estimatedMinutes: null,
      durationAuthority: "unresolved",
      plannerEligible: false,
      proposedInsertMode: "structural_only",
    };
  });

const physicalHeld = manifest.physicalCandidates
  .filter((candidate) => candidate.candidate_status !== "exact_unit_candidate")
  .map((candidate) => ({
    resourceId: candidate.resource_id,
    resourceName: candidate.resource_name,
    sectionId: candidate.section_id,
    sectionName: candidate.section_name,
    status: candidate.candidate_status,
    pageStart: candidate.page_start,
    pageEnd: candidate.page_end,
    curriculumNodeId: candidate.curriculum_node_id,
    curriculumTopic: candidate.curriculum_topic,
  }));

const youtubeTopicCounts = {};

for (const item of youtubeProposed) {
  youtubeTopicCounts[item.curriculumTopic] =
    (youtubeTopicCounts[item.curriculumTopic] ?? 0) + 1;
}

const physicalTypeCounts = {};

for (const item of physicalProposed) {
  const key = item.sourceUnitType ?? "<null>";
  physicalTypeCounts[key] = (physicalTypeCounts[key] ?? 0) + 1;
}

const proposal = {
  version: 1,
  authority: "proposal-only",
  generatedFrom: "MAT-001 deterministic candidate manifest",
  productionWritesAllowed: false,
  requiresExplicitApproval: true,
  plannerCutoverIncluded: false,
  edgeDeployIncluded: false,
  telegramDeployIncluded: false,

  youtube: {
    proposedMappings: youtubeProposed,
    held: youtubeHeld,
    topicCounts: youtubeTopicCounts,
  },

  physical: {
    proposedStructuralUnits: physicalProposed,
    held: physicalHeld,
    sourceTypeCounts: physicalTypeCounts,
    durationPolicy: {
      status: "unresolved",
      fabricatedDurations: 0,
      pageCountOnlyPolicyAllowed: false,
      plannerAuthorityGranted: false,
    },
  },

  acceptance: {
    youtubeProposedCount: youtubeProposed.length,
    youtubeHeldCount: youtubeHeld.length,
    physicalStructuralCount: physicalProposed.length,
    physicalHeldCount: physicalHeld.length,
    fabricatedDurationCount: physicalProposed.filter(
      (item) => item.estimatedMinutes !== null,
    ).length,
  },
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(proposal, null, 2) + "\n",
  "utf8",
);

console.log(JSON.stringify({
  acceptance: proposal.acceptance,
  youtubeTopicCounts,
  physicalTypeCounts,
}, null, 2));
