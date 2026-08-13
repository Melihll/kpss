import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import type { TelegramCardModel } from "./telegram-presentation.ts";

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

function wrap(value: unknown, width: number, maxLines = 2) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1) ?? "";
    if (!current || `${current} ${word}`.length <= width) {
      if (lines.length) lines[lines.length - 1] = current ? `${current} ${word}` : word;
      else lines.push(word);
      continue;
    }
    if (lines.length >= maxLines) break;
    lines.push(word);
  }
  if (words.join(" ").length > lines.join(" ").length && lines.length) lines[lines.length - 1] = clip(lines.at(-1), Math.max(4, width - 1));
  return lines.slice(0, maxLines);
}

function textLines(lines: string[], x: number, y: number, size: number, lineHeight: number, weight = 600, color = "#19191d") {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${xml(line)}</tspan>`).join("")}</text>`;
}

function metrics(model: TelegramCardModel, y: number) {
  const values = (model.metrics ?? []).slice(0, 4);
  if (!values.length) return { svg: "", height: 0 };
  const width = 900 / values.length;
  const cells = values.map((metric, index) => {
    const x = 90 + width * index;
    return `${index ? `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 102}" stroke="#e6e6eb" stroke-width="2"/>` : ""}
      <text x="${x + 22}" y="${y + 32}" font-size="22" font-weight="650" letter-spacing="1.5" fill="#777780">${xml(metric.label)}</text>
      <text x="${x + 22}" y="${y + 79}" font-size="38" font-weight="650" fill="#19191d">${xml(clip(metric.value, 14))}</text>`;
  }).join("");
  return { svg: `<rect x="90" y="${y}" width="900" height="102" rx="18" fill="#f6f6f8"/>${cells}`, height: 132 };
}

function primary(model: TelegramCardModel, y: number) {
  if (!model.primary) return { svg: "", height: 0 };
  const title = wrap(model.primary.title, 32, 2);
  const titleHeight = 58 + Math.max(0, title.length - 1) * 54;
  const height = 144 + titleHeight + (model.primary.detail ? 38 : 0);
  return { svg: `<rect x="90" y="${y}" width="900" height="${height}" rx="24" fill="#f0efff" stroke="#dddafc" stroke-width="2"/>
    <text x="126" y="${y + 45}" font-size="22" font-weight="700" letter-spacing="2" fill="#5147d9">${xml(model.primary.label)}</text>
    ${textLines(title, 126, y + 104, 48, 54, 650)}
    ${model.primary.meta ? `<text x="954" y="${y + 48}" text-anchor="end" font-size="30" font-weight="650" fill="#5147d9">${xml(clip(model.primary.meta, 18))}</text>` : ""}
    ${model.primary.detail ? `<text x="126" y="${y + height - 34}" font-size="26" font-weight="450" fill="#62626b">${xml(clip(model.primary.detail, 50))}</text>` : ""}`, height: height + 30 };
}

function items(model: TelegramCardModel, y: number) {
  const values = (model.items ?? []).slice(0, 4);
  if (!values.length) return { svg: "", height: 0 };
  const rowHeight = 80;
  const rows = values.map((item, index) => {
    const rowY = y + 58 + index * rowHeight;
    const done = item.state === "done";
    return `<line x1="90" y1="${rowY + 37}" x2="990" y2="${rowY + 37}" stroke="#ececf0" stroke-width="2"/>
      <circle cx="108" cy="${rowY}" r="10" fill="${done ? "#2f855a" : "#ffffff"}" stroke="${done ? "#2f855a" : "#8d8d98"}" stroke-width="3"/>
      ${done ? `<path d="M102 ${rowY}l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      <text x="140" y="${rowY + 10}" font-size="30" font-weight="560" fill="${done ? "#62626b" : "#25252a"}">${xml(clip(item.title, 34))}</text>
      ${item.detail ? `<text x="976" y="${rowY + 10}" text-anchor="end" font-size="25" font-weight="520" fill="#777780">${xml(clip(item.detail, 18))}</text>` : ""}`;
  }).join("");
  return { svg: `<text x="90" y="${y + 22}" font-size="22" font-weight="700" letter-spacing="2" fill="#777780">BUGÜNÜN AKIŞI</text>${rows}`, height: 70 + values.length * rowHeight };
}

function progress(model: TelegramCardModel, y: number) {
  if (!model.progress) return { svg: "", height: 0 };
  const percent = Math.max(0, Math.min(100, Number(model.progress.percent) || 0));
  return { svg: `<text x="90" y="${y + 22}" font-size="21" font-weight="650" letter-spacing="1.5" fill="#777780">${xml(model.progress.label)}</text>
    <text x="990" y="${y + 22}" text-anchor="end" font-size="24" font-weight="650" fill="#5147d9">${xml(model.progress.value)}</text>
    <rect x="90" y="${y + 45}" width="900" height="12" rx="6" fill="#e7e7ec"/>
    <rect x="90" y="${y + 45}" width="${Math.max(percent ? 12 : 0, 900 * percent / 100)}" height="12" rx="6" fill="#5548e8"/>`, height: 90 };
}

export function telegramCardSvg(model: TelegramCardModel) {
  let y = 88;
  const fragments: string[] = [];
  fragments.push(`<text x="90" y="${y}" font-size="24" font-weight="720" letter-spacing="3" fill="#5147d9">${xml(model.eyebrow)}</text>`);
  if (model.date) fragments.push(`<text x="990" y="${y}" text-anchor="end" font-size="23" font-weight="520" fill="#777780">${xml(model.date)}</text>`);
  y += 66;
  const titleLines = wrap(model.title, 28, 2);
  fragments.push(textLines(titleLines, 90, y, 58, 64, 680));
  y += 42 + titleLines.length * 64;
  if (model.headline) {
    fragments.push(`<text x="90" y="${y}" font-size="68" font-weight="680" letter-spacing="-2" fill="#19191d">${xml(clip(model.headline, 24))}</text>`);
    y += 68;
  }
  if (model.subhead) {
    fragments.push(`<text x="90" y="${y}" font-size="29" font-weight="470" fill="#62626b">${xml(clip(model.subhead, 58))}</text>`);
    y += 58;
  }
  const metricSection = metrics(model, y); fragments.push(metricSection.svg); y += metricSection.height;
  const primarySection = primary(model, y); fragments.push(primarySection.svg); y += primarySection.height;
  const itemSection = items(model, y); fragments.push(itemSection.svg); y += itemSection.height;
  const progressSection = progress(model, y); fragments.push(progressSection.svg); y += progressSection.height;
  if (model.note) {
    const noteLines = wrap(model.note, 54, 2);
    fragments.push(`<line x1="90" y1="${y}" x2="990" y2="${y}" stroke="#e6e6eb" stroke-width="2"/>${textLines(noteLines, 90, y + 48, 25, 34, 480, "#62626b")}`);
    y += 62 + Math.max(1, noteLines.length) * 34;
  }
  y += 66;
  const height = Math.max(620, Math.min(1400, y));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
    <rect width="1080" height="${height}" fill="#fbfbfa"/>
    <rect x="32" y="32" width="1016" height="${height - 64}" rx="34" fill="#ffffff" stroke="#e4e4e8" stroke-width="2"/>
    <style>text{font-family:Inter,sans-serif;font-kerning:normal}</style>
    ${fragments.join("\n")}
    <circle cx="90" cy="${height - 64}" r="7" fill="#5548e8"/>
    <text x="112" y="${height - 55}" font-size="20" font-weight="650" letter-spacing="1" fill="#777780">KPSS KOÇU</text>
  </svg>`;
}

export async function renderTelegramSvg(svg: string) {
  const font = await loadRenderer();
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    background: "#fbfbfa",
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
