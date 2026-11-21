import { videoSearchUrl } from "./planShared";
import { readablePalette, type GameStyle } from "./gameStyles";
import type { PlanCard, Sheet, Slide, VideoIdea } from "./types";

/**
 * A lesson's slides as one self-contained HTML document.
 *
 * The same document is what the tutor opens in the app and what they save
 * for a lesson without internet: in the app its pictures are links to the
 * server, in the pack they are written into the file itself. Nothing else
 * differs, so what was checked online is what runs offline.
 *
 * The page the tutor opens is theirs: the slide, their notes, the next slide.
 * "Child's screen" opens a second window with the slide alone - that is the
 * one shared on a video call or put on the projector. The tutor's notes are
 * never drawn into it.
 */

export type DeckInput = {
  title: string;
  card: Pick<PlanCard, "topic" | "words" | "goal">;
  slides: Slide[];
  sheets: Sheet[];
  videos: VideoIdea[];
  style: Pick<GameStyle, "palette" | "name">;
  /** Picture file name to what an <img> loads: a server URL, or a data: URI. */
  imageSrc: (name: string) => string | undefined;
  /** A ready-made picture's public path to what an <img> loads. */
  artSrc?: (path: string) => string | undefined;
  offline: boolean;
  /** "2026-11-20 14:05" - shown in a saved pack, so the tutor knows which it is. */
  savedAt?: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** JSON that cannot close the script element it sits in. */
const LINE_BREAKS = new RegExp("[\\u2028\\u2029]", "g");
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(LINE_BREAKS, " ");

export function renderDeck(input: DeckInput): string {
  // Text sits on the panel colour, checked to read at 4.5:1.
  const p = readablePalette(input.style.palette);
  const slides = input.slides.map((s) => ({
    part: s.part,
    title: s.title,
    text: s.text ?? "",
    say: s.say ?? "",
    emoji: s.emoji ?? "",
    image: s.image ? input.imageSrc(s.image) ?? "" : s.art ? input.artSrc?.(s.art) ?? "" : "",
    notes: s.notes ?? "",
    harder: s.harder ?? null,
  }));
  const data = { title: input.title, slides };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)}</title>
<style>
:root{--ground:${p.ground};--panel:${p.panel};--ink:${p.ink};--accent:${p.accent};--accent-ink:${p.accentInk};
--font:ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Nunito","Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:var(--font);background:#eef1f4;color:#1c2430}
button{font:inherit;cursor:pointer}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid #dfe3e8}
.bar h1{font-size:17px;margin:0 auto 0 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{border:1px solid #cfd5dc;background:#fff;border-radius:10px;padding:8px 12px;font-weight:600;font-size:14px;color:#1c2430}
.btn.on,.btn.primary{background:#1c2430;color:#fff;border-color:#1c2430}
.wrap{display:grid;gap:14px;padding:14px;grid-template-columns:minmax(0,1fr) 340px;max-width:1400px;margin:0 auto}
@media (max-width:900px){.wrap{grid-template-columns:1fr}}
.frame{aspect-ratio:16/9;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.12);container-type:size}
.side{display:flex;flex-direction:column;gap:12px}
.panel{background:#fff;border:1px solid #dfe3e8;border-radius:14px;padding:14px}
.panel h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7684;margin:0 0 6px}
.notes{white-space:pre-wrap;font-size:16px;line-height:1.5}
.next .frame{box-shadow:none;border:1px solid #dfe3e8}
.nav{display:flex;gap:8px;align-items:center}.nav .count{margin:0 auto;font-weight:700}
.videos a{color:#1c2430}.videos li{margin:6px 0}.hint{font-size:13px;color:#6b7684}
/* The slide itself: the same markup on the tutor's page and the child's screen. */
.slide{position:relative;width:100%;height:100%;background:var(--panel);color:var(--ink);box-shadow:inset 0 0 0 1.6cqh var(--ground);display:flex;flex-direction:column;
align-items:center;justify-content:center;text-align:center;gap:2.5cqh;padding:5cqh 6cqw;font-family:var(--font)}
.slide .part{position:absolute;top:4cqh;left:4cqw;font-size:2.6cqh;font-weight:700;opacity:.55;text-transform:uppercase;letter-spacing:.08em}
.slide .t{font-size:11cqh;font-weight:800;line-height:1.05;margin:0;overflow-wrap:anywhere}
.slide .x{font-size:6cqh;line-height:1.25;margin:0;max-width:90%;overflow-wrap:anywhere}
.slide .pic{max-height:45cqh;max-width:70cqw;border-radius:2cqh;background:#fff;object-fit:contain}
.slide .emo{font-size:22cqh;line-height:1}
.slide .say{border:0;border-radius:99px;background:var(--accent);color:var(--accent-ink);font-size:4.6cqh;font-weight:800;padding:1.6cqh 4cqh}
.slide.online .t{font-size:14cqh}.slide.online .x{font-size:7.5cqh}.slide.online .emo{font-size:26cqh}.slide.online .pic{max-height:40cqh}
.slide .harder{display:flex;flex-direction:column;align-items:center;gap:1.4cqh;background:color-mix(in srgb,var(--accent) 10%,var(--panel));border:.5cqh solid var(--accent);border-radius:3cqh;padding:2cqh 4cqw;max-width:92%}
.slide .harder .tag{font-size:2.6cqh;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)}
.slide .harder .t2{font-size:7cqh;font-weight:800;margin:0;line-height:1.1;overflow-wrap:anywhere}
.slide .harder .x{font-size:4.6cqh}.slide .harder .say{font-size:3.6cqh;padding:1.2cqh 3cqh}
.slide.up{gap:1.6cqh}.slide.up .t,.slide.online.up .t{font-size:8cqh}.slide.up .x,.slide.online.up .x{font-size:4.6cqh}
.slide.up .emo,.slide.online.up .emo{font-size:11cqh}.slide.up .pic{max-height:22cqh}.btn[hidden]{display:none}
.screen{position:fixed;inset:0;container-type:size;background:var(--panel)}
.here{position:fixed;inset:0;z-index:9;container-type:size}.here[hidden]{display:none}
.sheets{display:none}
@media print{
  @page{size:A4;margin:14mm}
  body{background:#fff}.app,.here{display:none!important}
  .sheets{display:block}.sheet{page-break-after:always;break-after:page;font-family:var(--font);color:#000}
  .sheet:last-child{page-break-after:auto;break-after:auto}
}
.sheet h3{font-size:24pt;margin:0 0 4mm}.sheet .who{font-size:12pt;margin-bottom:8mm}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.wcard{border:2px dashed #555;border-radius:4mm;height:58mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3mm}
.wcard b{font-size:26pt}.wcard span{font-size:34pt}.wcard img{max-height:32mm;max-width:70mm}
.line{font-size:18pt;margin:0 0 9mm;line-height:1.6}
.colour{display:flex;flex-direction:column;align-items:center;gap:8mm}
.colour img{max-width:100%;max-height:200mm}
.outline{font-size:72pt;font-weight:900;color:#fff;-webkit-text-stroke:2px #000;text-align:center}
.answers{font-size:11pt;color:#555;margin-top:10mm;border-top:1px solid #aaa;padding-top:4mm}
</style>
</head>
<body>
<div class="app">
  <div class="bar">
    <h1>${esc(input.title)}${input.offline && input.savedAt ? ` <span class="hint">· saved ${esc(input.savedAt)}</span>` : ""}</h1>
    <button class="btn" data-mode="online">Online</button>
    <button class="btn" data-mode="room">In the room</button>
    <button class="btn primary" id="open">Child's screen</button>
    <button class="btn" id="full">Full screen here</button>
    ${input.sheets.length ? `<button class="btn" id="print">Print sheets</button>` : ""}
  </div>
  <div class="wrap">
    <div>
      <div class="frame" id="cur"></div>
      <div class="nav" style="margin-top:10px">
        <button class="btn" id="prev">&larr; Back</button>
        <button class="btn" id="up" hidden>Harder &#9650;</button>
        <span class="count" id="count"></span>
        <button class="btn primary" id="next">Next &rarr;</button>
      </div>
      <p class="hint">Arrow keys or space move the slides, in either window. Notes and the next slide are on this page only.<span id="uphint" hidden> This slide has a harder step for the stronger children: "Harder" or the H key shows it on the child's screen.</span></p>
    </div>
    <div class="side">
      <div class="panel"><h2>Your notes</h2><div class="notes" id="notes"></div></div>
      <div class="panel next"><h2>Next</h2><div class="frame" id="nextf"></div></div>
      <div class="panel"><h2>Words</h2><div>${esc(input.card.words.join(" · ") || "-")}</div>
        ${input.card.goal ? `<p class="hint" style="margin:6px 0 0">${esc(input.card.goal)}</p>` : ""}</div>
      ${
        input.videos.length
          ? `<div class="panel videos"><h2>Videos to look up</h2><ul style="padding-left:18px;margin:0">${input.videos
              .map(
                (v) =>
                  `<li><a href="${esc(videoSearchUrl(v))}" target="_blank" rel="noopener noreferrer">${esc(v.platform)}: ${esc(v.query)}</a><br><span class="hint">${esc(v.what)}</span></li>`,
              )
              .join("")}</ul><p class="hint">Search ideas, not checked videos: watch one before you show it. They need the internet${
              input.offline ? " and are not in this file" : ""
            }.</p></div>`
          : ""
      }
    </div>
  </div>
</div>
<div class="here" id="here" hidden></div>
<div class="sheets">${input.sheets.map((s) => renderSheet(s, input)).join("")}</div>
<script type="application/json" id="deck">${safeJson(data)}</script>
<script>
(function(){
  var D=JSON.parse(document.getElementById("deck").textContent);
  var S=D.slides, i=0, mode="room", child=null, up=false;
  try{var m=localStorage.getItem("aloudli-deck-mode");if(m==="online"||m==="room")mode=m}catch(e){}
  function h(tag,cls,text){var el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el}
  var PART={warmup:"Warm-up",words:"New words",activity:"Game",speaking:"Speaking",wrapup:"Today"};
  function speak(text){try{var u=new SpeechSynthesisUtterance(text);u.lang="en-US";u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
  function slideEl(doc,k,withUp){
    var s=S[k],el=doc.createElement("div");el.className="slide "+mode+(withUp&&s&&s.harder?" up":"");
    if(!s)return el;
    el.appendChild(Object.assign(doc.createElement("div"),{className:"part",textContent:PART[s.part]||""}));
    if(s.image){var img=doc.createElement("img");img.className="pic";img.alt="";img.src=s.image;
      img.onerror=function(){var e=doc.createElement("div");e.className="emo";e.textContent=s.emoji||"";img.replaceWith(e)};el.appendChild(img)}
    else if(s.emoji){el.appendChild(Object.assign(doc.createElement("div"),{className:"emo",textContent:s.emoji}))}
    if(s.title)el.appendChild(Object.assign(doc.createElement("p"),{className:"t",textContent:s.title}));
    if(s.text)el.appendChild(Object.assign(doc.createElement("p"),{className:"x",textContent:s.text}));
    if(s.say){var b=doc.createElement("button");b.className="say";b.textContent="\\u{1F50A} Listen";
      b.onclick=function(ev){ev.stopPropagation();speak(s.say)};el.appendChild(b)}
    if(withUp&&s.harder){var hd=doc.createElement("div");hd.className="harder";
      hd.appendChild(Object.assign(doc.createElement("div"),{className:"tag",textContent:"Harder"}));
      if(s.harder.title)hd.appendChild(Object.assign(doc.createElement("p"),{className:"t2",textContent:s.harder.title}));
      if(s.harder.text)hd.appendChild(Object.assign(doc.createElement("p"),{className:"x",textContent:s.harder.text}));
      if(s.harder.say){var hb=doc.createElement("button");hb.className="say";hb.textContent="\\u{1F50A} Listen";
        hb.onclick=function(ev){ev.stopPropagation();speak(s.harder.say)};hd.appendChild(hb)}
      el.appendChild(hd)}
    return el;
  }
  function put(box,doc,k,withUp){box.replaceChildren(slideEl(doc,k,withUp))}
  function draw(){
    put(document.getElementById("cur"),document,i,up);
    var has=!!(S[i]&&S[i].harder),ub=document.getElementById("up");
    ub.hidden=!has;ub.classList.toggle("on",up);ub.innerHTML=up?"Easier &#9660;":"Harder &#9650;";
    document.getElementById("uphint").hidden=!has;
    var n=document.getElementById("nextf");if(i+1<S.length)put(n,document,i+1);else n.replaceChildren(h("div","slide "+mode,"End of the lesson"));
    document.getElementById("notes").textContent=(S[i]&&S[i].notes)||"No notes for this slide.";
    document.getElementById("count").textContent=(i+1)+" / "+S.length;
    var here=document.getElementById("here");if(!here.hidden)put(here,document,i,up);
    if(child&&!child.closed){var box=child.document.getElementById("screen");if(box)put(box,child.document,i,up)}
    document.querySelectorAll("[data-mode]").forEach(function(b){b.classList.toggle("on",b.dataset.mode===mode)});
  }
  function go(d){var j=Math.max(0,Math.min(S.length-1,i+d));if(j!==i)up=false;i=j;draw()}
  function toggleUp(){if(S[i]&&S[i].harder){up=!up;draw()}}
  function keys(ev){
    if(ev.target&&/INPUT|TEXTAREA/.test(ev.target.tagName))return;
    if(ev.key==="ArrowRight"||ev.key===" "||ev.key==="PageDown"){ev.preventDefault();go(1)}
    else if(ev.key==="ArrowLeft"||ev.key==="PageUp"){ev.preventDefault();go(-1)}
    else if(ev.key==="h"||ev.key==="H"||ev.key==="ArrowUp"||ev.key==="ArrowDown"){if(S[i]&&S[i].harder){ev.preventDefault();toggleUp()}}
    else if(ev.key==="Escape"){document.getElementById("here").hidden=true;if(document.fullscreenElement)document.exitFullscreen().catch(function(){})}
  }
  document.addEventListener("keydown",keys);
  document.getElementById("prev").onclick=function(){go(-1)};
  document.getElementById("next").onclick=function(){go(1)};
  document.getElementById("up").onclick=toggleUp;
  document.querySelectorAll("[data-mode]").forEach(function(b){b.onclick=function(){mode=b.dataset.mode;try{localStorage.setItem("aloudli-deck-mode",mode)}catch(e){}draw()}});
  document.getElementById("open").onclick=function(){
    if(child&&!child.closed){child.focus();return}
    child=window.open("","aloudli-child","width=1280,height=720");
    if(!child){alert("The browser blocked the second window. Allow pop-ups for this page, or use Full screen here.");return}
    var d=child.document;d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>'+document.title.replace(/</g,"&lt;")+'</title><style>'+document.querySelector("style").textContent+'</style></head><body><div class="screen" id="screen"></div></body></html>');
    d.close();
    d.addEventListener("keydown",keys);
    d.getElementById("screen").addEventListener("click",function(){go(1)});
    d.addEventListener("dblclick",function(){var r=d.documentElement;if(r.requestFullscreen)r.requestFullscreen().catch(function(){})});
    draw();
  };
  document.getElementById("full").onclick=function(){
    var here=document.getElementById("here");here.hidden=false;draw();
    here.onclick=function(){go(1)};
    if(here.requestFullscreen)here.requestFullscreen().catch(function(){});
    document.addEventListener("fullscreenchange",function(){if(!document.fullscreenElement)here.hidden=true},{once:true});
  };
  var pr=document.getElementById("print");if(pr)pr.onclick=function(){window.print()};
  if(pr&&/[?&]print=1/.test(location.search))setTimeout(function(){window.print()},400);
  window.addEventListener("beforeunload",function(){if(child&&!child.closed)child.close()});
  draw();
})();
</script>
</body>
</html>`;
}

/** One A4 page. A picture that is missing becomes a word to colour in, never a hole. */
function renderSheet(sheet: Sheet, input: DeckInput): string {
  const img = sheet.image ? input.imageSrc(sheet.image) : undefined;
  const head = `<h3>${esc(sheet.title)}</h3><div class="who">Name: ______________________</div>`;
  if (sheet.kind === "wordcards") {
    return `<section class="sheet">${head}<div class="cards">${sheet.items
      .map((w) => `<div class="wcard"><b>${esc(w)}</b></div>`)
      .join("")}</div></section>`;
  }
  if (sheet.kind === "worksheet") {
    return `<section class="sheet">${head}${sheet.items
      .map((line, n) => `<p class="line">${n + 1}. ${esc(line).replace(/_{2,}/g, "______________")}</p>`)
      .join("")}${
      sheet.answers?.length
        ? `<div class="answers">For the tutor: ${sheet.answers.map((a, n) => `${n + 1}. ${esc(a)}`).join(" &nbsp; ")}</div>`
        : ""
    }</section>`;
  }
  return `<section class="sheet">${head}<div class="colour">${
    img ? `<img src="${esc(img)}" alt="">` : ""
  }<div class="outline">${esc(sheet.items[0] ?? input.card.topic)}</div></div></section>`;
}
