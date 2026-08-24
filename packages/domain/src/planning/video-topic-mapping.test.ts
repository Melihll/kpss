import { describe, expect, it } from "vitest";
import { validateVideoTopicMapping } from "./video-topic-mapping";

describe("MAT-001 video-to-topic mapping", () => {
  it("accepts a reviewed full-video topic mapping", () => {
    const result = validateVideoTopicMapping({
      mappingId: "map-1",
      playlistVideoId: "video-5",
      curriculumNodeId: "topic-ebob",
      videoDurationSeconds: 1902,
      segmentStartSeconds: null,
      segmentEndSeconds: null,
      mappingStatus: "validated",
      provenance: "reviewed_mapping",
      isActive: true,
    });

    expect(result.structurallyValid).toBe(true);
    expect(result.plannerEligible).toBe(true);
    expect(result.effectiveStartSeconds).toBe(0);
    expect(result.effectiveEndSeconds).toBe(1902);
  });

  it("accepts a reviewed topic-specific video segment", () => {
    const result = validateVideoTopicMapping({
      mappingId: "map-2",
      playlistVideoId: "video-20",
      curriculumNodeId: "topic-b",
      videoDurationSeconds: 2400,
      segmentStartSeconds: 600,
      segmentEndSeconds: 1500,
      mappingStatus: "validated",
      provenance: "reviewed_mapping",
      isActive: true,
    });

    expect(result.structurallyValid).toBe(true);
    expect(result.plannerEligible).toBe(true);
    expect(result.effectiveStartSeconds).toBe(600);
    expect(result.effectiveEndSeconds).toBe(1500);
  });

  it("rejects invalid segment boundaries", () => {
    const result = validateVideoTopicMapping({
      mappingId: "map-3",
      playlistVideoId: "video-20",
      curriculumNodeId: "topic-b",
      videoDurationSeconds: 1200,
      segmentStartSeconds: 900,
      segmentEndSeconds: 1300,
      mappingStatus: "validated",
      provenance: "reviewed_mapping",
      isActive: true,
    });

    expect(result.structurallyValid).toBe(false);
    expect(result.plannerEligible).toBe(false);
    expect(result.errors).toContain("segment_outside_video_duration");
  });

  it("keeps AI candidates outside authoritative planning", () => {
    const result = validateVideoTopicMapping({
      mappingId: "map-4",
      playlistVideoId: "video-8",
      curriculumNodeId: "topic-c",
      videoDurationSeconds: 1800,
      segmentStartSeconds: null,
      segmentEndSeconds: null,
      mappingStatus: "validated",
      provenance: "ai_candidate",
      isActive: true,
    });

    expect(result.structurallyValid).toBe(true);
    expect(result.plannerEligible).toBe(false);
  });

  it("keeps ambiguous mappings outside authoritative planning", () => {
    const result = validateVideoTopicMapping({
      mappingId: "map-5",
      playlistVideoId: "video-9",
      curriculumNodeId: "topic-c",
      videoDurationSeconds: 1800,
      segmentStartSeconds: null,
      segmentEndSeconds: null,
      mappingStatus: "ambiguous",
      provenance: "reviewed_mapping",
      isActive: true,
    });

    expect(result.plannerEligible).toBe(false);
  });

  it("allows different topic mappings for the same video", () => {
    const first = validateVideoTopicMapping({
      mappingId: "map-a",
      playlistVideoId: "mixed-video",
      curriculumNodeId: "topic-a",
      videoDurationSeconds: 2000,
      segmentStartSeconds: 0,
      segmentEndSeconds: 900,
      mappingStatus: "validated",
      provenance: "reviewed_mapping",
      isActive: true,
    });

    const second = validateVideoTopicMapping({
      mappingId: "map-b",
      playlistVideoId: "mixed-video",
      curriculumNodeId: "topic-b",
      videoDurationSeconds: 2000,
      segmentStartSeconds: 900,
      segmentEndSeconds: 2000,
      mappingStatus: "validated",
      provenance: "reviewed_mapping",
      isActive: true,
    });

    expect(first.plannerEligible).toBe(true);
    expect(second.plannerEligible).toBe(true);
  });
});
