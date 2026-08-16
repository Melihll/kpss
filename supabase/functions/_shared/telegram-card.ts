import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import type { TelegramCardMetric, TelegramCardModel } from "./telegram-presentation.ts";

let rendererReady: Promise<Uint8Array> | null = null;

async function loadRenderer() {
  if (!rendererReady) {
    rendererReady = (async () => {
      if (Deno.env.get("TELEGRAM_CARD_RENDER_MODE") === "fail") throw new Error("CARD_RENDER_DISABLED");
      const [wasm, font] = await Promise.all([
        Deno.readFile(new URL("./telegram-assets/resvg.wasm", import.meta.url)),
        // resvg receives the complete desktop font, not a browser unicode-range
        // subset. This keeps Latin, digits and every Turkish glyph deterministic.
        Deno.readFile(new URL("./telegram-assets/inter-variable.ttf", import.meta.url)),
      ]);
      await initWasm(wasm);
      return font;
    })();
  }
  try {
    return await rendererReady;
  } catch (error) {
    rendererReady = null;
    throw error;
  }
}

const WIDTH = 1080;
const LEFT = 90;
const RIGHT = 990;
const CONTENT_WIDTH = RIGHT - LEFT;
const INK = "#19191D";
const MUTED = "#6F6E77";
const QUIET = "#929099";
const ACCENT = "#6255E7";
const ACCENT_INK = "#4E43C6";
const ACCENT_SOFT = "#F0EEFF";
const SURFACE = "#F6F5F2";
const BORDER = "#E7E5E0";

const xml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function clip(value: unknown, limit: number) {
  const text = String(value ?? "").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function wrap(value: unknown, maxCharacters: number, maxLines = 2) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let consumed = 0;
  for (const word of words) {
    const current = lines.at(-1) ?? "";
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      if (lines.length) lines[lines.length - 1] = candidate;
      else lines.push(candidate);
      consumed += word.length + (current ? 1 : 0);
      continue;
    }
    if (lines.length >= maxLines) break;
    lines.push(word);
    consumed += word.length + 1;
  }
  const original = words.join(" ");
  if (consumed < original.length && lines.length) {
    lines[lines.length - 1] = clip(lines.at(-1), Math.max(4, maxCharacters - 1));
  }
  return lines.slice(0, maxLines);
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  size: number,
  lineHeight: number,
  weight = 600,
  color = INK,
  attributes = "",
) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${attributes}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${xml(line)}</tspan>`).join("")}</text>`;
}

function eyebrow(label: string, y = 104, right?: string) {
  return `<text data-role="eyebrow" x="${LEFT}" y="${y}" font-size="24" font-weight="720" letter-spacing="2.4" fill="${ACCENT_INK}">${xml(label)}</text>
    ${right ? `<text data-role="metadata" x="${RIGHT}" y="${y}" text-anchor="end" font-size="24" font-weight="500" fill="${MUTED}">${xml(right)}</text>` : ""}`;
}

function footer(height: number) {
  return `<circle cx="${LEFT}" cy="${height - 62}" r="6" fill="${ACCENT}"/>
    <text x="110" y="${height - 54}" font-size="20" font-weight="650" letter-spacing="1.2" fill="${QUIET}">KPSS KOÇU</text>`;
}

function frame(body: string, height: number, format: "compact" | "standard" | "report") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" data-card-format="${format}">
    <rect width="${WIDTH}" height="${height}" fill="#F8F7F4"/>
    <rect x="32" y="32" width="1016" height="${height - 64}" rx="32" fill="#FFFFFF" stroke="${BORDER}" stroke-width="2"/>
    <style>text{font-family:Inter,sans-serif;font-kerning:normal}</style>
    ${body}
    ${footer(height)}
  </svg>`;
}

function metricCells(metrics: TelegramCardMetric[], y: number, options: { valueSize?: number; height?: number; role?: string } = {}) {
  const values = metrics.slice(0, 3);
  if (!values.length) return "";
  const gap = 16;
  const width = (CONTENT_WIDTH - gap * (values.length - 1)) / values.length;
  const height = options.height ?? 126;
  const valueSize = options.valueSize ?? 38;
  return values.map((metric, index) => {
    const x = LEFT + index * (width + gap);
    return `<g data-role="${options.role ?? "metric"}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${SURFACE}"/>
      <text x="${x + 24}" y="${y + 38}" font-size="21" font-weight="650" letter-spacing="1.1" fill="${MUTED}">${xml(metric.label)}</text>
      <text x="${x + 24}" y="${y + 91}" font-size="${valueSize}" font-weight="680" letter-spacing="-.5" fill="${INK}">${xml(clip(metric.value, 14))}</text>
    </g>`;
  }).join("");
}

function progressBlock(model: TelegramCardModel, y: number) {
  if (!model.progress) return "";
  const percent = Math.max(0, Math.min(100, Number(model.progress.percent) || 0));
  const filled = Math.max(percent ? 18 : 0, CONTENT_WIDTH * percent / 100);
  return `<g data-role="progress">
    <text x="${LEFT}" y="${y}" font-size="22" font-weight="650" letter-spacing="1" fill="${MUTED}">${xml(model.progress.label)}</text>
    <text x="${RIGHT}" y="${y}" text-anchor="end" font-size="27" font-weight="700" fill="${ACCENT_INK}">${xml(model.progress.value)}</text>
    <rect x="${LEFT}" y="${y + 28}" width="${CONTENT_WIDTH}" height="18" rx="9" fill="#EAE8E4"/>
    <rect x="${LEFT}" y="${y + 28}" width="${filled}" height="18" rx="9" fill="${ACCENT}"/>
  </g>`;
}

function noteBlock(note: string | undefined, y: number, maxCharacters = 56) {
  if (!note) return "";
  const lines = wrap(note, maxCharacters, 2);
  return `<g data-role="note"><circle cx="${LEFT + 8}" cy="${y - 7}" r="5" fill="${ACCENT}" opacity=".75"/>
    ${textLines(lines, LEFT + 28, y, 26, 36, 480, MUTED)}</g>`;
}

function contentHeight(contentBottom: number, minimum = 0) {
  return Math.ceil(Math.max(minimum, contentBottom + 140) / 10) * 10;
}

function todayCard(model: TelegramCardModel) {
  const visibleItems = (model.items ?? []).slice(0, 3);
  const hasPrimary = Boolean(model.primary);
  const itemCount = visibleItems.length;
  const hasFlow = itemCount > 0 || Boolean(model.moreItems);
  const height = hasPrimary ? (hasFlow ? 1290 : 1040) : (hasFlow ? 1060 : 740);
  const titleLines = wrap(model.title, 26, 2);
  let body = eyebrow(model.eyebrow);
  body += textLines(titleLines, LEFT, 178, 58, 62, 680, INK, 'data-role="date-title" letter-spacing="-1.4"');
  if (model.date) body += `<text x="${LEFT}" y="${178 + titleLines.length * 62}" font-size="25" font-weight="480" fill="${MUTED}">${xml(model.date)}</text>`;
  const metricsY = 272 + Math.max(0, titleLines.length - 1) * 50;
  body += metricCells(model.metrics ?? [], metricsY);
  let cursor = metricsY + 166;
  if (model.primary) {
    const heroLines = wrap(model.primary.title, 27, 2);
    const heroHeight = 248 + Math.max(0, heroLines.length - 1) * 42 + (model.primary.reason ? 36 : 0);
    body += `<g data-role="hero">
      <rect x="${LEFT}" y="${cursor}" width="${CONTENT_WIDTH}" height="${heroHeight}" rx="26" fill="${ACCENT_SOFT}" stroke="#DED9FF" stroke-width="2"/>
      <text x="${LEFT + 36}" y="${cursor + 51}" font-size="23" font-weight="720" letter-spacing="2" fill="${ACCENT_INK}">${xml(model.primary.label)}</text>
      ${model.primary.meta ? `<text data-role="hero-duration" x="${RIGHT - 36}" y="${cursor + 62}" text-anchor="end" font-size="54" font-weight="720" letter-spacing="-1.5" fill="${ACCENT_INK}">${xml(clip(model.primary.meta, 18))}</text>` : ""}
      ${textLines(heroLines, LEFT + 36, cursor + 126, 49, 55, 660, INK, 'data-role="hero-title" letter-spacing="-.8"')}
      ${model.primary.detail ? `<text x="${LEFT + 36}" y="${cursor + heroHeight - (model.primary.reason ? 65 : 35)}" font-size="27" font-weight="480" fill="${MUTED}">${xml(clip(model.primary.detail, 54))}</text>` : ""}
      ${model.primary.reason ? `<text x="${LEFT + 36}" y="${cursor + heroHeight - 28}" font-size="24" font-weight="470" fill="${ACCENT_INK}">${xml(clip(model.primary.reason, 62))}</text>` : ""}
    </g>`;
    cursor += heroHeight + 52;
  }
  if (hasFlow) {
    body += `<text x="${LEFT}" y="${cursor}" font-size="23" font-weight="700" letter-spacing="1.7" fill="${MUTED}">BUGÜNÜN AKIŞI</text>`;
    cursor += 42;
    visibleItems.forEach((item, index) => {
      const rowY = cursor + index * 70;
      const done = item.state === "done";
      body += `<g data-role="task-row">
        <circle cx="${LEFT + 11}" cy="${rowY + 14}" r="10" fill="${done ? ACCENT : "#FFFFFF"}" stroke="${done ? ACCENT : "#AAA8B0"}" stroke-width="3"/>
        ${done ? `<path d="M${LEFT + 5} ${rowY + 14}l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
        <text x="${LEFT + 38}" y="${rowY + 24}" font-size="29" font-weight="560" fill="${done ? MUTED : INK}">${xml(clip(item.title, 39))}</text>
        ${item.detail ? `<text x="${RIGHT}" y="${rowY + 24}" text-anchor="end" font-size="25" font-weight="560" fill="${done ? QUIET : MUTED}">${xml(clip(item.detail, 17))}</text>` : ""}
      </g>`;
    });
    cursor += itemCount * 70;
    if (model.moreItems) {
      body += `<text data-role="task-overflow" x="${LEFT + 38}" y="${cursor + 10}" font-size="25" font-weight="560" fill="${ACCENT_INK}">+${model.moreItems} görev daha</text>`;
      cursor += 48;
    }
    cursor += 25;
  }
  if (!hasPrimary && !hasFlow) {
    body += `<g data-role="empty-state"><rect x="${LEFT}" y="${cursor}" width="${CONTENT_WIDTH}" height="136" rx="22" fill="${SURFACE}"/>
      <text x="${LEFT + 28}" y="${cursor + 52}" font-size="22" font-weight="680" letter-spacing="1.1" fill="${MUTED}">BUGÜNÜN DURUMU</text>
      <text x="${LEFT + 28}" y="${cursor + 101}" font-size="29" font-weight="540" fill="${INK}">${xml(model.note ?? "Bugün için açık çalışma kalmadı.")}</text></g>`;
    cursor += 186;
  }
  body += progressBlock(model, cursor);
  return frame(body, height, "standard");
}

function nowCard(model: TelegramCardModel) {
  const titleLength = String(model.title ?? "").length;
  const titleSize = titleLength > 70 ? 40 : titleLength > 58 ? 44 : 52;
  const titleLineHeight = titleLength > 70 ? 48 : titleLength > 58 ? 52 : 58;
  const titleLines = wrap(model.title, titleLength > 70 ? 45 : titleLength > 58 ? 40 : 29, 2);
  const subheadLines = model.subhead ? wrap(model.subhead, 55, 2) : [];
  const noteLines = model.note ? wrap(model.note, 55, 2) : [];
  let body = eyebrow(model.eyebrow, 104, model.date);
  body += textLines(titleLines, LEFT, 204, titleSize, titleLineHeight, 660, INK, 'data-role="hero-title" letter-spacing="-.8"');
  const durationY = 204 + titleLines.length * titleLineHeight + 72;
  body += `<text data-role="hero-duration" x="${LEFT}" y="${durationY}" font-size="76" font-weight="720" letter-spacing="-2.4" fill="${ACCENT_INK}">${xml(model.headline)}</text>`;
  let cursor = durationY + 66;
  let contentBottom = durationY + 18;
  if (subheadLines.length) {
    body += textLines(subheadLines, LEFT, cursor, 28, 36, 490, MUTED, 'data-role="resource"');
    contentBottom = cursor + (subheadLines.length - 1) * 36 + 12;
    cursor += subheadLines.length * 36 + 50;
  } else cursor += 18;
  if (noteLines.length) {
    const noteHeight = 76 + Math.max(0, noteLines.length - 1) * 34;
    body += `<rect x="${LEFT}" y="${cursor - 28}" width="${CONTENT_WIDTH}" height="${noteHeight}" rx="20" fill="${SURFACE}"/>`;
    body += textLines(noteLines, LEFT + 28, cursor + 16, 27, 36, 500, INK, 'data-role="reason"');
    contentBottom = cursor - 28 + noteHeight;
  }
  const height = contentHeight(contentBottom, 560);
  return frame(body, height, "compact");
}

function completionCard(model: TelegramCardModel) {
  const taskLines = wrap(model.subhead, 38, 2);
  const hasNext = Boolean(model.primary);
  const noteLines = model.note ? wrap(model.note, 56, 2) : [];
  const sparseBottom = noteLines.length ? 615 + (noteLines.length - 1) * 36 + 12 : 534;
  const height = hasNext ? (model.note ? 1030 : 950) : contentHeight(sparseBottom);
  let body = eyebrow(model.eyebrow);
  body += `<text data-role="hero-duration" x="${LEFT}" y="226" font-size="72" font-weight="720" letter-spacing="-2" fill="${ACCENT_INK}">${xml(model.title)}</text>`;
  body += textLines(taskLines, LEFT, 292, 31, 40, 550, INK, 'data-role="hero-title"');
  const status = model.metrics?.[0];
  if (status) {
    body += `<g data-role="completion-status"><rect x="${LEFT}" y="390" width="${CONTENT_WIDTH}" height="144" rx="22" fill="${SURFACE}"/>
      <text x="${LEFT + 28}" y="432" font-size="21" font-weight="680" letter-spacing="1.2" fill="${MUTED}">${xml(status.label)}</text>
      <text x="${LEFT + 28}" y="497" font-size="42" font-weight="680" fill="${INK}">${xml(status.value)}</text></g>`;
  }
  if (model.primary) {
    const nextLines = wrap(model.primary.title, 34, 2);
    body += `<g data-role="next-block"><rect x="${LEFT}" y="562" width="${CONTENT_WIDTH}" height="286" rx="24" fill="${ACCENT_SOFT}" stroke="#DED9FF" stroke-width="2"/>
      <text x="${LEFT + 30}" y="608" font-size="22" font-weight="700" letter-spacing="1.5" fill="${ACCENT_INK}">${xml(model.primary.label)}</text>
      ${model.primary.meta ? `<text x="${RIGHT - 30}" y="616" text-anchor="end" font-size="38" font-weight="700" fill="${ACCENT_INK}">${xml(model.primary.meta)}</text>` : ""}
      ${textLines(nextLines, LEFT + 30, 674, 38, 45, 640, INK)}
      ${model.primary.detail ? `<text x="${LEFT + 30}" y="816" font-size="25" font-weight="480" fill="${MUTED}">${xml(clip(model.primary.detail, 55))}</text>` : ""}
    </g>`;
  }
  if (model.note) body += noteBlock(model.note, hasNext ? 910 : 615);
  return frame(body, height, hasNext ? "standard" : "compact");
}

function replanCard(model: TelegramCardModel) {
  const titleLines = wrap(model.title, 30, 2);
  const noteLines = model.note ? wrap(model.note, 58, 2) : [];
  const titleOffset = Math.max(0, titleLines.length - 1) * 56;
  const metricBottom = 330 + titleOffset + 142;
  const noteBottom = noteLines.length ? 555 + titleOffset + (noteLines.length - 1) * 36 + 12 : 0;
  const height = contentHeight(Math.max(metricBottom, noteBottom));
  let body = eyebrow(model.eyebrow);
  body += textLines(titleLines, LEFT, 214, 56, 62, 680, INK, 'data-role="hero-title" letter-spacing="-1"');
  body += metricCells(model.metrics ?? [], 330 + titleOffset, { valueSize: 44, height: 142 });
  body += noteBlock(model.note, 555 + titleOffset);
  return frame(body, height, "compact");
}

function resultCard(model: TelegramCardModel) {
  const height = 1000;
  let body = eyebrow(model.eyebrow);
  body += `<text data-role="hero-score" x="${LEFT}" y="228" font-size="68" font-weight="720" letter-spacing="-1.8" fill="${INK}">${xml(model.headline ?? model.title)}</text>`;
  body += metricCells(model.metrics ?? [], 292, { valueSize: 42, height: 148, role: "score-metric" });
  body += `<rect x="${LEFT}" y="486" width="${CONTENT_WIDTH}" height="180" rx="24" fill="${ACCENT_SOFT}"/>
    <text x="${LEFT + 30}" y="532" font-size="21" font-weight="680" letter-spacing="1.2" fill="${ACCENT_INK}">KONU DURUMU</text>
    ${textLines(wrap(model.title, 36, 2), LEFT + 30, 603, 40, 47, 650, INK, 'data-role="mastery-status"')}`;
  if (model.note) {
    body += `<text x="${LEFT}" y="744" font-size="22" font-weight="680" letter-spacing="1.2" fill="${MUTED}">TEKRAR</text>
      ${textLines(wrap(model.note.replace(/^Önerilen:\s*/i, ""), 55, 2), LEFT, 800, 29, 39, 520, INK, 'data-role="revision-status"')}`;
  } else {
    body += `<text data-role="revision-status" x="${LEFT}" y="772" font-size="29" font-weight="520" fill="${MUTED}">Konu şu an güçlü görünüyor.</text>`;
  }
  return frame(body, height, "standard");
}

function reportCard(model: TelegramCardModel) {
  const titleLines = wrap(model.title, 28, 2);
  const noteLines = model.note ? wrap(model.note, 58, 3) : [];
  const insights = (model.items ?? []).slice(0, 3);
  let body = eyebrow(model.eyebrow);
  body += textLines(titleLines, LEFT, 192, 54, 60, 680, INK, 'data-role="date-title" letter-spacing="-1"');
  const heroY = 192 + titleLines.length * 60 + 54;
  body += `<text data-role="hero-duration" x="${LEFT}" y="${heroY}" font-size="72" font-weight="720" letter-spacing="-2.2" fill="${ACCENT_INK}">${xml(model.headline)}</text>`;
  if (model.subhead) body += `<text x="${LEFT}" y="${heroY + 44}" font-size="26" font-weight="500" fill="${MUTED}">${xml(model.subhead)}</text>`;
  body += metricCells(model.metrics ?? [], heroY + 94, { valueSize: 42, height: 146 });
  const progressY = heroY + 312;
  body += progressBlock(model, progressY);
  const reviewY = model.progress ? progressY + 124 : heroY + 280;
  let contentBottom = reviewY;
  if (insights.length) {
    let insightY = reviewY;
    for (const insight of insights) {
      const detailLines = wrap(insight.detail, 57, 3);
      const blockHeight = 112 + Math.max(0, detailLines.length - 1) * 36;
      body += `<g data-role="report-insight"><rect x="${LEFT}" y="${insightY}" width="${CONTENT_WIDTH}" height="${blockHeight}" rx="22" fill="${SURFACE}"/>
        <text x="${LEFT + 28}" y="${insightY + 40}" font-size="21" font-weight="680" letter-spacing="1.1" fill="${MUTED}">${xml(insight.title)}</text>
        ${textLines(detailLines, LEFT + 28, insightY + 82, 27, 36, 510, INK)}</g>`;
      contentBottom = insightY + blockHeight;
      insightY += blockHeight + 18;
    }
  } else if (noteLines.length) {
    const noteHeight = 162 + Math.max(0, noteLines.length - 1) * 39;
    body += `<rect x="${LEFT}" y="${reviewY}" width="${CONTENT_WIDTH}" height="${noteHeight}" rx="24" fill="${SURFACE}"/>
      <text x="${LEFT + 30}" y="${reviewY + 46}" font-size="21" font-weight="680" letter-spacing="1.2" fill="${MUTED}">HAFTANIN ÖZETİ</text>
      ${textLines(noteLines, LEFT + 30, reviewY + 103, 28, 39, 500, INK, 'data-role="report-insight"')}`;
    contentBottom = reviewY + noteHeight;
  } else {
    body += `<rect x="${LEFT}" y="${reviewY}" width="${CONTENT_WIDTH}" height="136" rx="24" fill="${SURFACE}"/>
      <text x="${LEFT + 30}" y="${reviewY + 46}" font-size="21" font-weight="680" letter-spacing="1.2" fill="${MUTED}">HAFTANIN ÖZETİ</text>
      <text x="${LEFT + 30}" y="${reviewY + 96}" font-size="27" font-weight="500" fill="${INK}">Yeni haftaya sakin ve net bir planla devam et.</text>`;
    contentBottom = reviewY + 136;
  }
  const height = insights.length >= 3 && model.progress ? 1400 : contentHeight(contentBottom);
  return frame(body, height, "report");
}

function weekCard(model: TelegramCardModel) {
  const height = 1180;
  const headlineLines = model.headline ? wrap(model.headline, 30, 2) : [];
  let body = eyebrow(model.eyebrow);
  body += textLines(wrap(model.title, 28, 2), LEFT, 202, 58, 64, 690, INK, 'data-role="hero-title" letter-spacing="-1.2"');
  if (headlineLines.length) {
    body += `<text x="${LEFT}" y="344" font-size="22" font-weight="680" letter-spacing="1.2" fill="${MUTED}">ANA ODAK</text>`;
    body += textLines(headlineLines, LEFT, 405, 43, 50, 640, ACCENT_INK);
  }
  body += metricCells(model.metrics ?? [], 520, { valueSize: 44, height: 142 });
  if (model.primary) {
    body += `<rect x="${LEFT}" y="710" width="${CONTENT_WIDTH}" height="260" rx="24" fill="${ACCENT_SOFT}" stroke="#DED9FF" stroke-width="2"/>
      <text x="${LEFT + 30}" y="756" font-size="21" font-weight="700" letter-spacing="1.3" fill="${ACCENT_INK}">${xml(model.primary.label)}</text>
      ${model.primary.meta ? `<text data-role="hero-duration" x="${RIGHT - 30}" y="766" text-anchor="end" font-size="40" font-weight="700" fill="${ACCENT_INK}">${xml(model.primary.meta)}</text>` : ""}
      ${textLines(wrap(model.primary.title, 34, 2), LEFT + 30, 826, 39, 47, 640, INK)}`;
  }
  return frame(body, height, "standard");
}

export function telegramCardSvg(model: TelegramCardModel) {
  switch (model.variant) {
    case "today": return todayCard(model);
    case "now": return nowCard(model);
    case "completion": return completionCard(model);
    case "replan": return replanCard(model);
    case "result": return resultCard(model);
    case "report": return reportCard(model);
    case "week": return weekCard(model);
  }
}

export async function renderTelegramSvg(svg: string) {
  const font = await loadRenderer();
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    background: "#F8F7F4",
    font: { loadSystemFonts: false, fontBuffers: [font], defaultFontFamily: "Inter" },
    textRendering: 1,
    shapeRendering: 2,
  });
  const image = renderer.render();
  try {
    return image.asPng();
  } finally {
    image.free();
    renderer.free();
  }
}

export async function renderTelegramCard(model: TelegramCardModel) {
  return await renderTelegramSvg(telegramCardSvg(model));
}
