import fs from "node:fs";

function normalize(value) {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/[İI]/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/\s+/g, " ")
    .trim();
}

const rules = [
  ["Rasyonel ve Ondalık Sayılar", /RASYONEL|ONDALIK/],
  ["Üslü ve Köklü Sayılar", /USLU|KOKLU/],
  ["Yaş Problemleri", /YAS PROBLEM/],
  ["Hareket Problemleri", /HIZ PROBLEM|HAREKET PROBLEM/],
  ["Sayısal Mantık ve Grafik Yorumlama", /SAYISAL MANTIK|GRAFIK PROBLEM/],
  ["Permütasyon, Kombinasyon ve Olasılık", /PERMUTASYON|KOMBINASYON|OLASILIK/],
  ["Kümeler ve Fonksiyonlar", /KUMELER|FONKSIYON/],
  ["Geometri", /GEOMETRI|UCGEN|COKGEN|DORTGEN|CEMBER|DAIRE|KATI CISIM|ANALITIK/],
  ["Denklem ve Eşitsizlikler", /BASIT ESITSIZLIK|MUTLAK DEGER|CARPANLARA AYIRMA|DERECEDEN DENKLEM|ORAN - ORANTI|ORAN-ORANTI/],
  ["Problemler", /SAYI - KESIR PROBLEM|KARISIM PROBLEM|ISCI - HAVUZ PROBLEM/],
  ["Sayılar", /TEK VE CIFT|ASAL SAYI|ARDISIK SAYI|FAKTORIYEL|SAYI BASAMAK|TABAN ARITMETIGI|BOLME\b|BOLUNEBILME|ASAL CARPAN|EBOB EKOK|MODULER ARITMETIK/],
  ["Temel Kavramlar", /TEMEL KAVRAM|TEMEL ISLEM/],
];

function classify(title) {
  const normalized = normalize(title);

  if (/TANITIM/.test(normalized)) {
    return {
      status: "exclude_non_instructional",
      candidates: [],
      reason: "title_non_instructional",
    };
  }

  if (/KONU TEKRARI/.test(normalized)) {
    return {
      status: "segment_review_required",
      candidates: [],
      reason: "multi_topic_review_video",
    };
  }

  if (/YUZDE.*KAR.*ZARAR/.test(normalized)) {
    return {
      status: "ambiguous",
      candidates: ["Yüzde Problemleri", "Kâr-Zarar Problemleri"],
      reason: "combined_topic_title",
    };
  }

  const matches = rules
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([topic]) => topic);

  if (matches.length === 1) {
    return {
      status: "single_candidate",
      candidates: matches,
      reason: "deterministic_title_rule",
    };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      candidates: matches,
      reason: "multiple_title_rules",
    };
  }

  return {
    status: "manual_review",
    candidates: [],
    reason: "no_safe_title_rule",
  };
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  throw new Error("Usage: node mat001-youtube-title-candidates.mjs INPUT OUTPUT");
}

const rawText = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const raw = JSON.parse(rawText);
const dataset = raw.rows?.[0]?.mat001_h2_dataset;

if (!dataset) {
  throw new Error("MAT-001 H2 dataset missing from query output");
}

const topicByName = new Map(
  dataset.topics.map((topic) => [normalize(topic.name), topic.curriculum_node_id]),
);

const videos = dataset.videos.map((video) => {
  const decision = classify(video.title);

  return {
    videoId: video.video_id,
    position: video.position,
    title: video.title,
    durationSeconds: video.duration_seconds,
    watchedSeconds: video.watched_seconds,
    status: decision.status,
    reason: decision.reason,
    candidates: decision.candidates.map((name) => ({
      name,
      curriculumNodeId: topicByName.get(normalize(name)) ?? null,
    })),
  };
});

for (const video of videos) {
  for (const candidate of video.candidates) {
    if (!candidate.curriculumNodeId) {
      video.status = "manual_review";
      video.reason = "candidate_not_in_profile_catalog";
    }
  }
}

const counts = videos.reduce((acc, video) => {
  acc[video.status] = (acc[video.status] ?? 0) + 1;
  return acc;
}, {});

const manifest = {
  version: 1,
  target: dataset.target,
  generatedFrom: "production-read-only",
  authority: "candidate-only",
  writesAllowed: false,
  summary: counts,
  videos,
  physicalSummary: dataset.physical_summary,
  physicalCandidates: dataset.physical_candidates,
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

console.log(JSON.stringify({
  youtube: counts,
  physical: dataset.physical_summary,
}, null, 2));
