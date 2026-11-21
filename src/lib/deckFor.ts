import { renderDeck } from "./deck";
import { PLAIN_STYLE, styleFor } from "./gameStyles";
import { studentsOf } from "./plans";
import { promises as fs } from "fs";
import path from "path";
import { readPlanImage } from "./store";
import type { LessonPlan, PlanCard } from "./types";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * A card's slides as HTML. For the offline pack, every picture is written
 * into the document; otherwise pictures load from the server.
 */
export async function deckFor(plan: LessonPlan, card: PlanCard, pack: boolean): Promise<string> {
  const materials = card.materials!;
  const { students, group } = await studentsOf(plan);
  // One child: their own look. A group: a calm neutral one for everybody.
  const style = students.length === 1 && !group ? styleFor(students[0]) : PLAIN_STYLE;
  const inline = new Map<string, string>();
  if (pack) {
    const names = [...materials.slides, ...materials.sheets].map((x) => x.image).filter((n): n is string => Boolean(n));
    for (const name of new Set(names)) {
      const data = await readPlanImage(name);
      if (data) inline.set(name, `data:${TYPES[name.split(".").pop() ?? ""] ?? "image/png"};base64,${data.toString("base64")}`);
    }
  }
  // Ready-made drawings (the Bible stories) live in public/: linked online,
  // written into the file offline.
  const art = new Map<string, string>();
  if (pack) {
    for (const p of new Set(materials.slides.map((s) => s.art).filter((a): a is string => Boolean(a)))) {
      if (!/^\/christianity\/[\w-]+\.svg$/.test(p)) continue;
      const data = await fs.readFile(path.join(process.cwd(), "public", p)).catch(() => null);
      if (data) art.set(p, `data:image/svg+xml;base64,${data.toString("base64")}`);
    }
  }
  return renderDeck({
    artSrc: (p) => (pack ? art.get(p) : /^\/christianity\/[\w-]+\.svg$/.test(p) ? p : undefined),
    title: card.topic || "Lesson",
    card,
    slides: materials.slides,
    sheets: materials.sheets,
    videos: materials.videos,
    style,
    imageSrc: (name) => (pack ? inline.get(name) : `/api/plan-images/${encodeURIComponent(name)}`),
    offline: pack,
    savedAt: pack ? `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC` : undefined,
  });
}

export function packFileName(topic: string): string {
  const file = topic.replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "lesson";
  return `aloudli-${file}.html`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Several lessons in one file: a list to pick from, each lesson the same
 * document as on its own, held in a frame. Opens with no internet.
 */
export function renderBundle(lessons: { title: string; html: string }[]): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>aloudli lessons</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:ui-rounded,"Arial Rounded MT Bold","Segoe UI",system-ui,sans-serif;background:#eef1f4;color:#1c2430}
.pick{max-width:640px;margin:0 auto;padding:24px}.pick h1{font-size:22px}
.pick button{display:block;width:100%;text-align:left;font:inherit;font-size:18px;font-weight:700;padding:16px;margin:8px 0;border:1px solid #cfd5dc;border-radius:12px;background:#fff;cursor:pointer}
.back{position:fixed;left:10px;bottom:10px;z-index:5;font:inherit;font-weight:600;padding:8px 12px;border-radius:10px;border:1px solid #cfd5dc;background:#fff;cursor:pointer}
iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff}
@media print{.pick,.back{display:none}}
</style></head><body>
<div class="pick" id="pick"><h1>Lessons</h1>
${lessons.map((l, i) => `<button data-i="${i}">${i + 1}. ${esc(l.title)}</button>`).join("\n")}
<p style="font-size:13px;color:#6b7684">Works with no internet. Videos are links and need it.</p></div>
<button class="back" id="back" hidden>&larr; All lessons</button>
${lessons.map((l, i) => `<iframe id="f${i}" hidden srcdoc="${esc(l.html)}"></iframe>`).join("\n")}
<script>
document.querySelectorAll("[data-i]").forEach(function(b){b.onclick=function(){
  document.getElementById("pick").hidden=true;document.getElementById("back").hidden=false;
  document.querySelectorAll("iframe").forEach(function(f){f.hidden=true});
  var f=document.getElementById("f"+b.dataset.i);f.hidden=false;f.focus();
}});
document.getElementById("back").onclick=function(){
  document.querySelectorAll("iframe").forEach(function(f){f.hidden=true});
  document.getElementById("pick").hidden=false;this.hidden=true;
};
</script></body></html>`;
}
