import { DATA } from "./data/syllabus-data.js";
import { WORK_SAMPLE_DATA } from "./data/work-sample-data.js";
import {
  advanceCalendarYearInName,
  buildPlanScope,
  calculateCoverage,
  copyPlan,
  duplicateUnit,
  setCalendarYearInName,
  syllabusSearchText
} from "./planner-model.js";

const WORK_SAMPLES = WORK_SAMPLE_DATA.collections || [];
const KLAS = [["en","English"],["ma","Mathematics"],["st","Science & Tech"],
              ["hs","HSIE"],["ca","Creative Arts"],["pd","PDHPE"]];
const YEARS = [["Kindergarten","Kindergarten"],["Year 1","Year 1"],["Year 2","Year 2"],
               ["Year 3","Year 3"],["Year 4","Year 4"],["Year 5","Year 5"],["Year 6","Year 6"]];
const STAGE_YEARS = {
  "Early Stage 1":["Kindergarten"], "Stage 1":["Year 1","Year 2"],
  "Stage 2":["Year 3","Year 4"], "Stage 3":["Year 5","Year 6"]
};
const PARTS = [["A","Part A"],["B","Part B"]];
const WORK_FORMATS = [["Written","Written"],["Video","Video"],["Audio","Audio"]];
const KLA_ORDER = new Map(KLAS.map(([key],index)=>[key,index]));
const STAGE_ORDER = new Map(Object.keys(STAGE_YEARS).map((stage,index)=>[stage,index]));

const state = {q:"", kla:new Set(), year:new Set(), part:new Set(), open:new Set(), closed:new Set(),
               groupOpen:new Set(), showAll:new Set(), allOpen:false};
const workState = {q:"", kla:new Set(), year:new Set(), format:new Set(), subject:""};

/* search index */
DATA.forEach((r,i)=>{
  r._i=i;
  r._years=STAGE_YEARS[r.st] || [];
  r._part=r.k==="ma" ? (r.t.match(/ ([AB])$/)?.[1] || "") : "";
  r._s=syllabusSearchText(r);
});
WORK_SAMPLES.forEach((collection,index)=>{
  collection._i=index;
  collection._s=(collection.kla+" "+collection.subject+" "+collection.years.join(" ")+" "+
    collection.samples.map(sample=>sample.t+" "+sample.media.join(" ")).join(" ")).toLowerCase();
});

const esc = s => s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const terms = () => state.q.toLowerCase().split(/\s+/).filter(t=>t.length>1);
function hl(s){
  let h = esc(s);
  for(const t of terms()){
    h = h.replace(new RegExp("("+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi"),"<mark>$1</mark>");
  }
  return h;
}

/* filter chips */
function chips(host, items, set, colour, onchange=render){
  items.forEach(([val,label])=>{
    const b=document.createElement("button");
    b.className="chip"; b.type="button"; b.setAttribute("aria-pressed","false");
    b.dataset.value=val;
    b.innerHTML=(colour?`<span class="dot" style="background:var(--${val})"></span>`:"")+esc(label);
    b.onclick=()=>{ set.has(val)?set.delete(val):set.add(val);
      b.setAttribute("aria-pressed", set.has(val)); onchange(); };
    host.appendChild(b);
  });
}
/* Parts A and B are learning sequences rather than year levels, so this is a default
   and not a rule: the first year of a stage takes A, the second B, and Kindergarten
   takes neither because Early Stage 1 has no parts. Clicking a part chip afterwards
   overrides it until the year changes again. */
function syncMathsParts(){
  state.part.clear();
  state.year.forEach(year=>{
    const stage = Object.keys(STAGE_YEARS).find(st=>STAGE_YEARS[st].includes(year));
    if(!stage || STAGE_YEARS[stage].length < 2) return;
    state.part.add(STAGE_YEARS[stage].indexOf(year) === 0 ? "A" : "B");
  });
  document.querySelectorAll("#partf .chip").forEach(chip=>
    chip.setAttribute("aria-pressed", state.part.has(chip.dataset.value)));
}
/* The filter drawer collapses to a summary under 640px. Above that the summary is
   hidden by CSS and the filters are meant to be permanently visible — but a details
   element without [open] keeps its content out of layout whatever display its child
   is given, so the rows disappeared on desktop. Keep the open state in step with the
   breakpoint, and leave whatever the reader chose on a narrow screen. */
const NARROW_FILTERS = window.matchMedia("(max-width:640px)");
function syncFilterDrawers(){
  if(NARROW_FILTERS.matches) return;
  document.querySelectorAll(".filterdrawer").forEach(drawer=>{ drawer.open = true; });
}
NARROW_FILTERS.addEventListener("change", syncFilterDrawers);
syncFilterDrawers();

chips(document.getElementById("klaf"), KLAS, state.kla, true);
chips(document.getElementById("yearf"), YEARS, state.year, false, ()=>{ syncMathsParts(); render(); });
chips(document.getElementById("partf"), PARTS, state.part, false);
chips(document.getElementById("wsklaf"), KLAS, workState.kla, true, renderWork);
chips(document.getElementById("wsyearf"), YEARS, workState.year, false, renderWork);
chips(document.getElementById("wsformatf"), WORK_FORMATS, workState.format, false, renderWork);

const workSubjects = [...new Set(WORK_SAMPLES.map(collection=>collection.subject))];
const workSubjectSelect = document.getElementById("wssubject");
workSubjects.forEach(subject=>{
  const option=document.createElement("option");
  option.value=subject; option.textContent=subject;
  workSubjectSelect.appendChild(option);
});
workSubjectSelect.addEventListener("change",event=>{
  workState.subject=event.target.value;
  renderWork();
});

function yearLabel(r){
  const shown = state.year.size ? r._years.filter(y=>state.year.has(y)) : r._years;
  if(shown.length===1) return shown[0];
  const nums=shown.map(y=>+y.replace("Year ",""));
  return `Years ${nums[0]}\u2013${nums[nums.length-1]}`;
}

function hit(str){
  const ts=terms(); if(!ts.length) return true;
  const s=str.toLowerCase();
  return ts.every(t=>s.includes(t));
}
function matches(){
  const ts=terms();
  return DATA.filter(r=>{
    if(state.kla.size && !state.kla.has(r.k)) return false;
    if(state.year.size && !r._years.some(y=>state.year.has(y))) return false;
    if(state.part.size && r._part && !state.part.has(r._part)) return false;
    return ts.every(t=>r._s.includes(t));
  }).sort((a,b)=>
    (KLA_ORDER.get(a.k) ?? 99) - (KLA_ORDER.get(b.k) ?? 99) ||
    (STAGE_ORDER.get(a.st) ?? 99) - (STAGE_ORDER.get(b.st) ?? 99) ||
    (a.ord ?? a._i) - (b.ord ?? b._i) ||
    a._i - b._i
  );
}
/* content points that actually match the search */
function cps(r){
  const all=[]; r.g.forEach(g=>g.i.forEach(it=>all.push([g,it])));
  if(!terms().length) return {list:all, filtered:false, total:all.length};
  const m=all.filter(([,it])=>hit(it.t));
  return {list:m.length?m:all, filtered:m.length>0&&m.length<all.length, total:all.length};
}
function outs(r){
  if(!terms().length) return r.o;
  const m=r.o.filter(o=>hit(o.c+" "+o.d));
  return m.length?m:r.o;
}

function faHTML(r){
  const searching = terms().length>0;
  const showAll = state.showAll.has(r._i);
  const open = state.allOpen || state.open.has(r._i) || (searching && !state.closed.has(r._i));
  const sel = (searching && !showAll) ? cps(r) : {list:null, filtered:false,
                total:r.g.reduce((a,g)=>a+g.i.length,0)};
  const ncp = sel.list ? sel.list.length : sel.total;
  const soon = r.status==="New from 2027";
  const fk = faKey(r);
  const faTick = tickState(fk);
  let h = `<article class="fa${faTick?' taught':''}" style="--kla:var(--${r.k})"${open?' open':''}>
    <div class="fa-headrow">
    <button class="tick" type="button" role="checkbox" aria-checked="${!!faTick}" data-fk="${fk}"
      aria-label="Mark this focus area as taught">&#10003;</button>
    <button class="fa-head" aria-expanded="${open}" data-i="${r._i}">
      <span class="chev">&#9654;</span>
      <span class="tw">
        <span class="eyebrow">
          <span class="tag">${esc(r.kla)}</span>
          <span class="tag stage" title="${esc(r.st)}">${esc(yearLabel(r))}</span>
          ${soon?'<span class="tag soon">New 2027</span>':''}
        </span>
        <span class="fa-t">${esc(r.t)}</span>
        <span class="codes">${r.o.filter(o=>o.c).map(o=>`<span class="code">${hl(o.c)}</span>`).join("")}</span>
      </span>
      <span class="count">${ncp}</span>
    </button>
    <button class="termchip${faTick?' on':''}" type="button" data-termfk="${fk}"
      title="Click to change the term">${faTick?faTick.t:""}</button>
    </div>`;
  if(open){
    h += `<div class="body">`;
    const ol = (searching && !showAll) ? outs(r) : r.o;
    if(ol.length){
      h += `<div class="sec"><div class="sech">Outcomes</div>`;
      ol.forEach(o=>{ h += `<div class="out"><span class="c">${hl(o.c||"&#8212;")}</span><span class="d">${hl(o.d)}</span></div>`; });
      h += `</div>`;
    }
    const pairs = sel.list || (()=>{const a=[];r.g.forEach(g=>g.i.forEach(it=>a.push([g,it])));return a;})();
    if(pairs.length){
      h += `<div class="sec"><div class="sech">Content</div>`;
      let cur=null;
      pairs.forEach(([g,it])=>{
        if(g!==cur){
          if(cur) h+=`</ul></details>`;
          const groupKey=`${r._i}:${r.g.indexOf(g)}`;
          const groupCount=pairs.filter(([pairGroup])=>pairGroup===g).length;
          const groupOpen=state.allOpen || searching || state.groupOpen.has(groupKey);
          h += `<details class="grp" data-group="${groupKey}"${groupOpen?' open':''}>`+
            `<summary class="grpt"><span>${esc(g.t)}</span><span class="grpcount">${groupCount}</span></summary>`+
            `<ul class="cps">`;
          cur=g;
        }
        const pk = ptKey(r,g,it);
        const ptTick = tickState(pk, true);
        h += `<li class="cp${ptTick?' taught':''}">` +
          `<button class="ptick" type="button" role="checkbox" aria-checked="${!!ptTick}" data-pk="${pk}"` +
          ` aria-label="Mark this content point as taught">&#10003;</button>` +
          `<button class="cbtn" data-copy="${esc(it.t)}">copy</button>${hl(it.t)}`;
        if(it.n) h += `<span class="meta"><b>Including:</b> ${esc(it.n)}</span>`;
        if(it.e){
          h += `<details class="meta example"><summary>For example</summary>` +
            `<span class="example-text">${esc(it.e)}</span></details>`;
        }
        h += `</li>`;
      });
      if(cur) h += `</ul></details>`;
      if(sel.filtered) h += `<button class="linkish" data-showall="${r._i}">Show all ${sel.total} content points in this focus area</button>`;
      if(showAll && searching) h += `<button class="linkish" data-hideall="${r._i}">Show only matching content points</button>`;
      h += `</div>`;
    }
    h += `<div class="srcrow">
      <a href="${esc(r.u)}" target="_blank" rel="noopener">Open on NSW Curriculum &#8599;</a>
      <button class="linkish" data-fa="${r._i}">Copy this focus area</button>
    </div></div>`;
  }
  return h + `</article>`;
}

function plainFA(r){
  let L=[`${r.kla} — ${yearLabel(r)} (${r.st}) — ${r.t}`];
  r.o.forEach(o=>L.push(`${o.c}: ${o.d}`));
  r.g.forEach(g=>{ L.push(``,g.t); g.i.forEach(it=>{
    L.push(`- ${it.t}`);
    if(it.n) L.push(`  Including: ${it.n.replace(/\n/g," ")}`);
    if(it.e) L.push(`  For example: ${it.e.replace(/\n/g," ")}`);
  });});
  L.push(``,r.u);
  return L.join("\n");
}

function render(){
  const base = matches();
  const m = trackFilter(base);
  updateProgress(base);
  updateFilterLabels();
  const searching = terms().length>0;
  const ncp = m.reduce((a,r)=>a+(searching?cps(r).list.length:r.g.reduce((b,g)=>b+g.i.length,0)),0);
  document.getElementById("meter").innerHTML =
    `<b>${m.length}</b> focus area${m.length===1?"":"s"} &middot; <b>${ncp}</b> ` +
    (searching?"matching ":"") + `content point${ncp===1?"":"s"}`;
  document.getElementById("copyall").hidden = !m.length;
  const out = document.getElementById("out");
  if(!m.length){
    const hiddenByTracker = track.on && track.view!=="all" && base.length;
    out.innerHTML = `<div class="empty"><p>${hiddenByTracker
      ? "Everything in this scope is ticked as taught."
      : "Nothing matches those filters."}</p>
      <button class="btn" onclick="document.getElementById('reset').click()">Clear search and filters</button></div>`;
    return;
  }
  out.innerHTML = m.map(faHTML).join("");
  if(scopeReady && !document.getElementById("scope-view").hidden) renderScope();
}

/* Australian Curriculum work samples */
const workTerms = () => workState.q.toLowerCase().split(/\s+/).filter(term=>term.length>1);
function workYearLabel(years){
  if(years.length===1) return years[0];
  const last=years[years.length-1];
  if(years[0]==="Kindergarten") return `Kindergarten\u2013${last}`;
  return `Years ${years[0].replace("Year ","")}\u2013${last.replace("Year ","")}`;
}
function visibleWorkSamples(collection){
  const context=(collection.kla+" "+collection.subject+" "+collection.years.join(" ")).toLowerCase();
  const searchTerms=workTerms();
  return collection.samples.filter(sample=>{
    if(workState.format.size && !sample.media.some(format=>workState.format.has(format))) return false;
    const searchable=context+" "+(sample.t+" "+sample.media.join(" ")).toLowerCase();
    return searchTerms.every(term=>searchable.includes(term));
  });
}
function matchingWorkCollections(){
  return WORK_SAMPLES.filter(collection=>{
    if(workState.kla.size && !workState.kla.has(collection.k)) return false;
    if(workState.year.size && !collection.years.some(year=>workState.year.has(year))) return false;
    if(workState.subject && collection.subject!==workState.subject) return false;
    return visibleWorkSamples(collection).length>0;
  });
}
function workCollectionHTML(collection){
  const samples=visibleWorkSamples(collection);
  const yearText=workYearLabel(collection.years);
  return `<article class="work-collection" style="--kla:var(--${collection.k})">
    <div class="work-collection-head">
      <div class="tw">
        <div class="eyebrow">
          <span class="tag">${esc(collection.kla)}</span>
          <span class="tag stage">${esc(collection.subject)}</span>
          <span class="tag stage">${esc(yearText)}</span>
        </div>
        <h3>${esc(collection.subject)} &mdash; ${esc(yearText)}</h3>
      </div>
      <span class="work-count">${samples.length} sample${samples.length===1?"":"s"}</span>
    </div>
    <div class="sample-grid">
      ${samples.map(sample=>`<a class="sample-card" href="${esc(sample.u)}" target="_blank" rel="noopener">
        <span class="sample-title">${esc(sample.t)}</span>
        <span class="sample-meta">
          ${sample.media.map(format=>`<span class="media-tag">${esc(format)}</span>`).join("")}
          <span class="sample-open">Open &#8599;</span>
        </span>
      </a>`).join("")}
    </div>
  </article>`;
}
function renderWork(){
  updateFilterLabels();
  const collections=matchingWorkCollections();
  const sampleCount=new Set(collections.flatMap(collection=>
    visibleWorkSamples(collection).map(sample=>sample.u))).size;
  document.getElementById("wsmeter").innerHTML =
    `<b>${collections.length}</b> collection${collections.length===1?"":"s"} &middot; `+
    `<b>${sampleCount}</b> work sample${sampleCount===1?"":"s"}`;
  const out=document.getElementById("wsout");
  if(!collections.length){
    out.innerHTML=`<div class="empty"><p>Nothing matches those work-sample filters.</p>
      <button class="btn" onclick="document.getElementById('wsreset').click()">Clear search and filters</button></div>`;
    return;
  }
  out.innerHTML=collections.map(workCollectionHTML).join("");
}

/* events */
const viewButtons = [...document.querySelectorAll("[data-view]")];
/* setView runs long before the tracker and scope modules below, so arriving on
   #scope must not try to draw the planner yet. `var` deliberately: a const or let
   here would throw from inside setView instead of reading as false. */
var scopeReady = false;
const VIEW_PANELS = {syllabus:"syllabus-view", scope:"scope-view",
                     assessment:"assessment-view", "work-samples":"work-samples-view"};
const VIEW_HASHES = {syllabus:"#syllabus", scope:"#scope",
                     assessment:"#assessment", "work-samples":"#work-samples"};
const VIEW_TITLES = {syllabus:"NSW K-6 Syllabus Finder",
                     scope:"Scope and sequence | NSW K-6 Syllabus Finder",
                     assessment:"Assessment | NSW K-6 Syllabus Finder",
                     "work-samples":"Work samples | NSW K-6 Syllabus Finder"};
function setView(view, updateHash=false){
  Object.entries(VIEW_PANELS).forEach(([name,id])=>{
    document.getElementById(id).hidden = name !== view;
  });
  document.getElementById("content-controls").hidden = view !== "syllabus";
  document.getElementById("work-controls").hidden = view !== "work-samples";
  /* the tracker belongs to ticking and planning alike */
  document.getElementById("trackbar").hidden = !(view==="syllabus" || view==="scope");
  /* a scope and sequence is what you intend to teach, so the term tiles and the
     taught filter — both recording controls — have no place on it */
  const planning = view === "scope";
  const termTiles = document.getElementById("trktermf");
  if(termTiles) termTiles.hidden = planning;
  viewButtons.forEach(button=>{
    const selected = button.dataset.view===view;
    button.setAttribute("aria-selected", selected);
    button.tabIndex = selected ? 0 : -1;
  });
  document.title = VIEW_TITLES[view] || VIEW_TITLES.syllabus;
  if(view==="scope" && scopeReady) renderScope();
  if(updateHash) history.replaceState(null,"",VIEW_HASHES[view]);
}
viewButtons.forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view,true)));
document.querySelector(".viewnav").addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
  event.preventDefault();
  const current = Math.max(0, viewButtons.indexOf(document.activeElement));
  const next = event.key === "Home" ? 0 : event.key === "End" ? viewButtons.length-1 :
    (current + (event.key === "ArrowRight" ? 1 : -1) + viewButtons.length) % viewButtons.length;
  viewButtons[next].focus();
  setView(viewButtons[next].dataset.view,true);
});
const initialView=["#scope","#scope-and-sequence"].includes(location.hash) ? "scope" :
  ["#assessment","#common-grade-scale"].includes(location.hash) ? "assessment" :
  ["#work-samples","#work"].includes(location.hash) ? "work-samples" : "syllabus";
setView(initialView);

document.getElementById("copygrades").addEventListener("click",()=>{
  const gradeText = [...document.querySelectorAll(".grade-row")].map(row=>
    `${row.dataset.grade}: ${row.querySelector(".grade-description").textContent.trim().replace(/\s+/g," ")}`
  ).join("\n\n");
  copy(gradeText, "A–E grade scale copied");
});

document.getElementById("out").addEventListener("click", e=>{
  const tickBtn = e.target.closest("[data-fk]");
  if(tickBtn){ toggleTick(tickBtn.dataset.fk); return; }
  const termBtn = e.target.closest("[data-termfk]");
  if(termBtn){ cycleTerm(termBtn.dataset.termfk); return; }
  const pointBtn = e.target.closest("[data-pk]");
  if(pointBtn){ toggleTick(pointBtn.dataset.pk, true); return; }
  const head = e.target.closest(".fa-head");
  if(head){
    const i = +head.dataset.i;
    if(state.allOpen){ state.allOpen=false; matches().forEach(r=>state.open.add(r._i)); }
    if(head.getAttribute("aria-expanded")==="true"){ state.open.delete(i); state.closed.add(i); }
    else { state.open.add(i); state.closed.delete(i); }
    render(); return;
  }
  const sa = e.target.closest("[data-showall]");
  if(sa){ state.showAll.add(+sa.dataset.showall); render(); return; }
  const ha = e.target.closest("[data-hideall]");
  if(ha){ state.showAll.delete(+ha.dataset.hideall); render(); return; }
  const cb = e.target.closest("[data-copy]");
  if(cb){ copy(cb.dataset.copy, "Content point copied"); return; }
  const fb = e.target.closest("[data-fa]");
  if(fb){ copy(plainFA(DATA[+fb.dataset.fa]), "Focus area copied"); }
});
document.getElementById("out").addEventListener("toggle",event=>{
  const group=event.target;
  if(!group.matches?.(".grp[data-group]")) return;
  group.open ? state.groupOpen.add(group.dataset.group) : state.groupOpen.delete(group.dataset.group);
},true);

function copy(text, msg){
  const done = ()=>toast(msg);
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(done, ()=>fallback(text,done));
  } else fallback(text,done);
}
function fallback(text, done){
  const ta=document.createElement("textarea");
  ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); done(); }catch(_){ toast("Copy blocked by the browser"); }
  ta.remove();
}
let tt;
function toast(m){
  const el=document.getElementById("toast");
  el.textContent=m; el.classList.add("on");
  clearTimeout(tt); tt=setTimeout(()=>el.classList.remove("on"),1600);
}

let dt;
document.getElementById("q").addEventListener("input", e=>{
  clearTimeout(dt);
  dt=setTimeout(()=>{ state.q=e.target.value.trim();
    state.open.clear(); state.closed.clear(); state.showAll.clear(); render(); }, 160);
});
document.getElementById("expand").addEventListener("click", e=>{
  state.allOpen=!state.allOpen; state.open.clear(); state.closed.clear(); state.groupOpen.clear();
  e.target.textContent = state.allOpen ? "Collapse all" : "Expand all";
  render();
});
document.getElementById("reset").addEventListener("click", ()=>{
  state.q=""; state.kla.clear(); state.year.clear(); state.part.clear(); state.open.clear();
  state.closed.clear(); state.groupOpen.clear(); state.showAll.clear(); state.allOpen=false;
  document.getElementById("q").value="";
  document.getElementById("expand").textContent="Expand all";
  document.querySelectorAll("#content-controls .chip").forEach(c=>c.setAttribute("aria-pressed","false"));
  render();
});
let wsdt;
document.getElementById("wsq").addEventListener("input", event=>{
  clearTimeout(wsdt);
  wsdt=setTimeout(()=>{ workState.q=event.target.value.trim(); renderWork(); },160);
});
document.getElementById("wsreset").addEventListener("click",()=>{
  workState.q=""; workState.kla.clear(); workState.year.clear(); workState.format.clear();
  workState.subject="";
  document.getElementById("wsq").value="";
  document.getElementById("wssubject").value="";
  document.querySelectorAll("#work-controls .chip").forEach(chip=>chip.setAttribute("aria-pressed","false"));
  renderWork();
});
document.getElementById("copyall").addEventListener("click", ()=>{
  copy(matches().map(plainFA).join("\n\n----------------\n\n"), "All results copied");
});
document.addEventListener("keydown", e=>{
  if(e.key==="/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){
    const selected=document.querySelector('.viewtab[aria-selected="true"]')?.dataset.view;
    if(selected!=="assessment"){
      e.preventDefault(); document.getElementById(selected==="work-samples" ? "wsq" : "q").focus();
    }
  }
  if(e.key==="Escape" && document.activeElement.id==="q"){
    document.getElementById("reset").click(); document.getElementById("q").blur();
  }
  if(e.key==="Escape" && document.activeElement.id==="wsq"){
    document.getElementById("wsreset").click(); document.getElementById("wsq").blur();
  }
});

/* ---------- teaching tracker ---------- */
const TRACK_KEY = "easy-syllabus.tracker.v1";
const TRACK_TERMS = [["T1","Term 1"],["T2","Term 2"],["T3","Term 3"],["T4","Term 4"]];
/* two states now: everything, or only what is still to teach */

/* Stable identifiers. A tick must survive the page being rebuilt or reordered, so
   keys hash the syllabus wording itself rather than any position in DATA. */
function fnv1a(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,0x01000193)>>>0; }
  return h.toString(36);
}
const faKey = r => fnv1a([r.syl,r.sh,r.t].join("|"));
const ptKey = (r,g,it) => fnv1a([r.syl,r.sh,r.t,g.t,it.t].join("|"));
const faLabel = r => `${r.kla} — ${yearLabel(r)} — ${r.t}`;

const FA_BY_KEY = new Map();
const PT_BY_KEY = new Map();
const POINT_TO_FOCUS = new Map();
DATA.forEach(r=>{
  r._fk = faKey(r);
  FA_BY_KEY.set(r._fk, r);
  r.g.forEach(g=>g.i.forEach(it=>{
    it._pk = ptKey(r,g,it);
    PT_BY_KEY.set(it._pk, {r,g,it});
    POINT_TO_FOCUS.set(it._pk, r._fk);
  }));
});

const track = {on:false, term:"T1", view:"all", store:{active:null, trackers:[]}};

function trackLoad(){
  try{
    const parsed = JSON.parse(localStorage.getItem(TRACK_KEY) || "null");
    if(parsed && Array.isArray(parsed.trackers)) track.store = parsed;
    /* the term stamps every tick, so losing it on reload silently mislabels work.
       Older payloads simply lack the field and fall back to Term 1. */
    track.term = track.store.term || "T1";
  }catch(_){ /* unreadable or unavailable storage: carry on with an empty tracker */ }
}
/* A rejected write is reverted by the listener, so the change really is gone.
   Never let the routine local save overwrite that warning with reassurance. */
let syncFailed = false;
function noteSyncFailure(what){
  syncFailed = true;
  setSaved("Sync problem — local copy kept", true);
  toast(what + " could not be saved to the shared plan");
}
function noteSyncOk(){
  syncFailed = false;
  setSaved("Shared live", false, true);
}
let trackSaveTimer;
function trackSave(){
  clearTimeout(trackSaveTimer);
  trackSaveTimer = setTimeout(()=>{
    const tracker = activeTracker();
    if(tracker) tracker.updated = new Date().toISOString();
    try{
      localStorage.setItem(TRACK_KEY, JSON.stringify(track.store));
      if(syncFailed) return;   // leave the warning standing
      /* say which it is: a shared tracker is not merely on this device */
      setSaved(tracker && tracker.remote ? "Shared live" : "Local only", false, !!tracker?.remote);
    }catch(_){
      setSaved("Local save failed — export a backup", true);
    }
  }, 250);
}
function setSaved(text, warn, shared=false){
  const el = document.getElementById("trksaved");
  el.textContent = text;
  el.classList.toggle("warn", !!warn);
  el.classList.toggle("shared", !!shared && !warn);
}
function activeTracker(){
  return track.store.trackers.find(t=>t.id===track.store.active) || null;
}
function makeTracker(name){
  const now = new Date().toISOString();
  const tracker = {id:fnv1a(name+"|"+Date.now()+"|"+Math.random()), name,
                   created:now, updated:now, fa:{}, pt:{}};
  track.store.trackers.push(tracker);
  track.store.active = tracker.id;
  return tracker;
}
function tickState(key, isPoint){
  const tracker = activeTracker();
  if(!tracker) return null;
  return (isPoint ? tracker.pt : tracker.fa)[key] || null;
}
function toggleTick(key, isPoint){
  const tracker = activeTracker();
  if(!tracker){ toast("Create a plan first"); return; }
  const map = isPoint ? tracker.pt : tracker.fa;
  const value = map[key] ? null : {t:track.term};
  if(value) map[key] = value; else delete map[key];
  trackSave();
  if(tracker.remote) pushTick(tracker, key, isPoint, value);
  /* a full render would drop scroll position and keyboard focus, so repaint just
     this control unless the taught/not-taught filter means the card must leave */
  if(!isPoint && track.view!=="all"){ render(); return; }
  paintTick(key, isPoint);
  updateProgress(matches());
}
function paintTick(key, isPoint){
  const tick = tickState(key, isPoint);
  const button = document.querySelector(`[data-${isPoint?"pk":"fk"}="${key}"]`);
  if(!button) return;
  button.setAttribute("aria-checked", !!tick);
  button.closest(isPoint ? "li.cp" : ".fa").classList.toggle("taught", !!tick);
  if(isPoint) return;
  const chip = document.querySelector(`[data-termfk="${key}"]`);
  if(chip){
    chip.textContent = tick ? tick.t : "";
    chip.classList.toggle("on", !!tick);
  }
}
function cycleTerm(key){
  const tracker = activeTracker();
  if(!tracker || !tracker.fa[key]) return;
  const order = TRACK_TERMS.map(([value])=>value);
  tracker.fa[key].t = order[(order.indexOf(tracker.fa[key].t)+1) % order.length];
  trackSave(); paintTick(key);
  if(tracker.remote) pushTick(tracker, key, false, tracker.fa[key]);
}
function trackFilter(list){
  if(!track.on || track.view==="all" || !activeTracker()) return list;
  const want = track.view==="taught";
  return list.filter(r=>!!tickState(faKey(r))===want);
}
function updateProgress(list){
  const tracker = activeTracker();
  const scope = tracker ? trackScope() : list;
  const coverage = tracker ? calculateCoverage(scope,tracker,POINT_TO_FOCUS) : null;
  const total = scope.length;
  const done = coverage ? coverage.taught : 0;
  document.getElementById("trkprog").innerHTML =
    coverage
      ? `<b>${coverage.planned}</b> planned &middot; <b>${done}</b> taught of <b>${total}</b>`
      : `<b>0</b> of <b>${total}</b> focus area${total===1?"":"s"} taught`;
  document.getElementById("trkbar").style.width = total ? (done/total*100).toFixed(1)+"%" : "0";

  let points = 0, pointsDone = 0;
  scope.forEach(r=>r.g.forEach(g=>{
    points += g.i.length;
    if(tracker) pointsDone += g.i.filter(it=>tracker.pt[it._pk]).length;
  }));
  document.getElementById("trkprog2").innerHTML =
    `<b>${pointsDone}</b> of <b>${points}</b> content point${points===1?"":"s"} ticked`;
}

/* Planner coverage always represents the plan's full year-group scope. Hidden
   filters on the Syllabus tab must not silently narrow coordinator reports. */
function trackScope(){
  return buildPlanScope(DATA,activeTracker(),STAGE_YEARS).sort((a,b)=>
    (KLA_ORDER.get(a.k) ?? 99) - (KLA_ORDER.get(b.k) ?? 99) ||
    (STAGE_ORDER.get(a.st) ?? 99) - (STAGE_ORDER.get(b.st) ?? 99) ||
    (a.ord ?? a._i) - (b.ord ?? b._i) || a._i - b._i
  );
}

function renderTrackerSelect(){
  const select = document.getElementById("trksel");
  select.innerHTML = "";
  select.disabled = !track.store.trackers.length;
  if(!track.store.trackers.length){
    const option = document.createElement("option");
    option.value = ""; option.textContent = "No plan yet";
    select.appendChild(option);
  } else {
    track.store.trackers.forEach(tracker=>{
      const option = document.createElement("option");
      option.value = tracker.id;
      option.textContent = tracker.remote ? tracker.name + " (shared)" : tracker.name;
      if(tracker.id===track.store.active) option.selected = true;
      select.appendChild(option);
    });
  }
  updateTrackerButtons();
}
function updateTrackerButtons(){
  const shared = !!(activeTracker() && activeTracker().remote);
  document.getElementById("trkshare").textContent = shared ? "Manage sharing" : "Share";
  document.getElementById("trkdel").textContent = shared ? "Leave this plan" : "Delete this plan";
  if(!syncFailed) setSaved(shared ? "Shared live" : "Local only", false, shared);
}
function radioChips(host, items, current, onpick){
  items.forEach(([value,label])=>{
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.dataset.value = value;
    b.setAttribute("aria-pressed", current===value);
    b.textContent = label;
    b.onclick = ()=>{
      [...host.querySelectorAll(".chip")].forEach(c=>
        c.setAttribute("aria-pressed", c.dataset.value===value));
      onpick(value);
    };
    host.appendChild(b);
  });
}

/* ---------- summary sheet ---------- */
let sheetMode = null;
let sheetReturnFocus = null;
function showSheet(mode,html,focusSelector){
  sheetMode=mode;
  sheetReturnFocus=document.activeElement;
  const sheet=document.getElementById("sheet");
  sheet.innerHTML=html;
  document.getElementById("summary").hidden=false;
  document.body.classList.add("report","noscroll");
  requestAnimationFrame(()=>{
    (focusSelector ? sheet.querySelector(focusSelector) : null)?.focus();
    if(!sheet.contains(document.activeElement)) sheet.querySelector("button,input,select,[href]")?.focus();
  });
}
function hideSheet(){
  document.getElementById("summary").hidden=true;
  document.body.classList.remove("report","noscroll");
  const restore=sheetReturnFocus;
  sheetMode=null; sheetReturnFocus=null;
  if(restore && restore.isConnected) restore.focus();
}
/* A focus area represents teaching as soon as either the whole area or any one of
   its content points is ticked. The summary is evidence of coverage, not a test
   that every content point has been completed. Keep every term represented when
   teachers return to the same focus area later in the year. */
function teachingTermsFor(tracker, focusArea){
  const terms = new Set();
  const remember = tick=>{ if(tick && tick.t) terms.add(tick.t); };
  remember(tracker.fa[focusArea._fk]);
  focusArea.g.forEach(group=>group.i.forEach(point=>remember(tracker.pt[point._pk])));
  return TRACK_TERMS.map(([value])=>value).filter(value=>terms.has(value));
}
let coverageTab = "overview";
function coverageGroups(rows){
  const groups=[];
  rows.forEach(row=>{
    const record = row.record || row.r;
    const last=groups[groups.length-1];
    if(last && last.k===record.k) last.rows.push(row);
    else groups.push({kla:record.kla,k:record.k,rows:[row]});
  });
  return groups;
}
function teachingSummaryBody(tracker,coverage){
  const rows = coverage.rows.map(({record:r,taughtTerms})=>{
    const terms = taughtTerms;
    const points = r.g.reduce((a,g)=>a+g.i.length,0);
    const donePoints = r.g.reduce((a,g)=>a+g.i.filter(it=>tracker.pt[it._pk]).length,0);
    return {r, terms, term:terms.join("/"), points, donePoints};
  });
  const taught = rows.filter(row=>row.terms.length);
  const orphans = Object.keys(tracker.fa).filter(k=>!FA_BY_KEY.has(k)).length;
  const byTerm = TRACK_TERMS.map(([value])=>
    ({term:value, n:taught.filter(row=>row.terms.includes(value)).length}));

  const klaGroups = coverageGroups(rows);
  let h = `<div class="sumtotals">
    <div class="sumtile"><div class="n">${taught.length}</div><div class="l">Focus areas taught</div></div>
    <div class="sumtile"><div class="n">${rows.length-taught.length}</div><div class="l">Not yet taught</div></div>
    <div class="sumtile"><div class="n">${Math.round(rows.length?taught.length/rows.length*100:0)}%</div><div class="l">Of this scope</div></div>
    ${byTerm.map(t=>`<div class="sumtile"><div class="n">${t.n}</div><div class="l">${t.term}</div></div>`).join("")}
  </div>`;

  if(!rows.length) h += `<p class="sumempty">No focus areas fall inside this plan.</p>`;

  klaGroups.forEach(group=>{
    const done = group.rows.filter(row=>row.terms.length).length;
    h += `<section class="sumkla" style="--kla:var(--${group.k})">
      <div class="sumklah"><span>${esc(group.kla)}</span>
        <span class="n">${done} of ${group.rows.length}</span></div>`;
    group.rows.forEach(row=>{
      h += `<div class="sumitem${row.terms.length?"":" untaught"}">
        <span class="t">${row.term || "—"}</span>
        <span class="st">${esc(row.r.sh)}</span>
        <span>${esc(row.r.t)}</span>
        <span class="pts">${row.donePoints?row.donePoints+" of "+row.points+" points":""}</span>
      </div>`;
    });
    h += `</section>`;
  });

  h += `<p class="sumnote">A focus area counts as taught when it or any of its content points is ticked; you do not need to tick every point.
    ${orphans?`<b>${orphans} tick${orphans===1?" no longer matches":"s no longer match"} a current focus area</b> — the syllabus wording may have changed since they were recorded; they are kept, not deleted. `:""}
    Progress is stored in this browser. Export a backup to move it to another device.</p>`;
  return h;
}
function coverageOverviewBody(coverage){
  const labels={"planned-taught":"Planned & taught","planned-only":"Planned · not taught",
                "taught-only":"Taught · not planned",unplanned:"Not planned"};
  let h = `<div class="sumtotals coveragetotals">
    <div class="sumtile"><div class="n">${coverage.planned}</div><div class="l">Planned</div></div>
    <div class="sumtile"><div class="n">${coverage.taught}</div><div class="l">Taught</div></div>
    <div class="sumtile attention"><div class="n">${coverage.total-coverage.planned}</div><div class="l">Need planning</div></div>
    <div class="sumtile"><div class="n">${coverage.total-coverage.taught}</div><div class="l">Not yet taught</div></div>
  </div>`;
  coverageGroups(coverage.rows).forEach(group=>{
    const planned=group.rows.filter(row=>row.planned).length;
    const taught=group.rows.filter(row=>row.taught).length;
    const total=group.rows.length;
    h += `<section class="coveragekla" style="--kla:var(--${group.k})">
      <div class="coverageklah"><strong>${esc(group.kla)}</strong>
        <span>${planned}/${total} planned &middot; ${taught}/${total} taught</span></div>
      <div class="coveragebars" aria-hidden="true"><i style="width:${total?planned/total*100:0}%"></i><b style="width:${total?taught/total*100:0}%"></b></div>`;
    group.rows.forEach(row=>{
      const r=row.record;
      const planTerms=row.plannedTerms.join("/") || "—";
      const taughtTerms=row.taughtTerms.join("/") || "—";
      const tag=`<span class="coveragestatus ${row.status}">${labels[row.status]}</span>`;
      const content=`<span class="coveragemain"><span class="st">${esc(r.sh)}</span><span>${esc(r.t)}</span></span>
        <span class="coverageterms">Plan ${planTerms} &middot; Teach ${taughtTerms}</span>${tag}`;
      h += row.planned
        ? `<div class="coverageitem">${content}</div>`
        : `<button class="coverageitem coveragegap" type="button" data-coverage-record="${r._i}">${content}<span class="coverageopen">Open syllabus &#8594;</span></button>`;
    });
    h += `</section>`;
  });
  h += `<p class="sumnote">Planned means a focus area is attached to at least one unit. Taught means the focus area or any one of its content points is ticked. Repeated units are counted once.</p>`;
  return h;
}
function coverageHTML(){
  const tracker=activeTracker();
  const coverage=calculateCoverage(trackScope(),tracker,POINT_TO_FOCUS);
  const date=new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  return `<div class="sheethead">
    <div><h2 id="sheettitle">Coverage &mdash; ${esc(tracker.name)}</h2>
      <div class="sheetmeta">${esc(tracker.year || "All year groups")} &middot; generated ${date}</div></div>
    <div class="sheetacts"><button class="sheetbtn primary" id="sumprint" type="button">Print teaching summary</button>
      <button class="sheetbtn" id="sumclose" type="button">Close</button></div>
  </div>
  <div class="coveragetabs" role="tablist" aria-label="Coverage view">
    <button type="button" role="tab" data-coverage-tab="overview" aria-selected="${coverageTab==="overview"}">Overview</button>
    <button type="button" role="tab" data-coverage-tab="teaching" aria-selected="${coverageTab==="teaching"}">Teaching summary</button>
  </div>` + (coverageTab==="overview" ? coverageOverviewBody(coverage) : teachingSummaryBody(tracker,coverage));
}
function renderCoverageSheet(){
  document.getElementById("sheet").innerHTML=coverageHTML();
  document.getElementById("sumclose").onclick=closeSummary;
  document.getElementById("sumprint").onclick=()=>{
    coverageTab="teaching"; renderCoverageSheet(); setTimeout(()=>window.print(),0);
  };
  document.querySelectorAll("[data-coverage-tab]").forEach(button=>button.onclick=()=>{
    coverageTab=button.dataset.coverageTab; renderCoverageSheet();
    document.querySelector(`[data-coverage-tab="${coverageTab}"]`)?.focus();
  });
  document.querySelectorAll("[data-coverage-record]").forEach(button=>button.onclick=()=>{
    const record=DATA[+button.dataset.coverageRecord];
    if(!record) return;
    closeSummary();
    setView("syllabus",true);
    applyTrackerYear();
    state.kla.clear(); state.kla.add(record.k);
    document.querySelectorAll("#klaf .chip").forEach(chip=>chip.setAttribute("aria-pressed",chip.dataset.value===record.k));
    state.q=(record.o.find(outcome=>outcome.c)?.c || record.o[0]?.d || record.g[0]?.i[0]?.t || "");
    document.getElementById("q").value=state.q;
    state.open.add(record._i); state.closed.delete(record._i);
    render();
    document.getElementById("q").focus();
  });
}
function openSummary(){
  const tracker = activeTracker();
  if(!tracker){ toast("Create a plan first"); return; }
  coverageTab="overview";
  showSheet("coverage",coverageHTML(),"#sumclose");
  renderCoverageSheet();
}
function closeSummary(){
  hideSheet();
}

/* ---------- backup files ---------- */
function trackExport(){
  const tracker = activeTracker();
  if(!tracker){ toast("Create a plan first"); return; }
  /* labels travel with the keys so a tick can be re-matched by hand if NESA rewords a descriptor */
  const payload = {
    format:"easy-syllabus-tracker", version:1, exported:new Date().toISOString(),
    tracker:{
      name:tracker.name, created:tracker.created, updated:tracker.updated,
      fa:Object.entries(tracker.fa).map(([k,v])=>
        ({k, t:v.t, label:FA_BY_KEY.has(k)?faLabel(FA_BY_KEY.get(k)):null})),
      pt:Object.entries(tracker.pt).map(([k,v])=>
        ({k, t:v.t, label:PT_BY_KEY.has(k)?PT_BY_KEY.get(k).it.t:null})),
      units:tracker.units || {}
    }
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (tracker.name.replace(/[^\w\s-]+/g,"").trim().replace(/\s+/g,"-").toLowerCase()
                || "plan") + "-backup.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast("Backup downloaded");
}
function trackImport(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    let payload;
    try{ payload = JSON.parse(reader.result); }
    catch(_){ toast("That file is not a valid backup"); return; }
    if(!payload || payload.format!=="easy-syllabus-tracker" || !payload.tracker){
      toast("That file is not a plan backup"); return;
    }
    const incoming = payload.tracker;
    const name = incoming.name || "Imported plan";
    /* merging keeps every tick from both sides rather than picking a winner */
    const target = track.store.trackers.find(t=>t.name===name) || makeTracker(name);
    const merged = target.fa && Object.keys(target.fa).length;
    (incoming.fa||[]).forEach(e=>{ if(e && e.k) target.fa[e.k] = {t:e.t || "T1"}; });
    (incoming.pt||[]).forEach(e=>{ if(e && e.k) target.pt[e.k] = {t:e.t || "T1"}; });
    if(incoming.units){
      if(!target.units) target.units = {};
      Object.entries(incoming.units).forEach(([id,unit])=>{ target.units[id] = unit; });
    }
    track.store.active = target.id;
    trackSave(); renderTrackerSelect(); render();
    toast(merged ? `Merged into “${name}”` : `Imported “${name}”`);
  };
  reader.readAsText(file);
}

/* ---------- plan reuse ---------- */
function copyPlanHTML(source){
  const suggestedName=advanceCalendarYearInName(source.name);
  const years=[...suggestedName.matchAll(/\b20\d{2}\b/g)];
  const calendarYear=years.length ? years[years.length-1][0] : new Date().getFullYear()+1;
  return `<div class="sheethead">
    <div><h2 id="sheettitle">Copy plan</h2>
      <div class="sheetmeta">Create a separate local plan from ${esc(source.name)}</div></div>
    <div class="sheetacts"><button class="sheetbtn primary" id="copyplansave" type="button">Create copy</button>
      <button class="sheetbtn" id="copyplancancel" type="button">Cancel</button></div>
  </div>
  <div class="copygrid">
    <div class="ufield"><label class="ulabel" for="copyplanname">New plan name</label>
      <input class="uinput" id="copyplanname" value="${esc(suggestedName)}" autocomplete="off"></div>
    <div class="ufield"><label class="ulabel" for="copyplanyear">Calendar year</label>
      <input class="uinput" id="copyplanyear" type="number" min="2020" max="2100" value="${calendarYear}"></div>
  </div>
  <p class="copyyeargroup"><b>Year group:</b> ${esc(source.year || "All years")} <span>This stays the same in the copy.</span></p>
  <label class="checkrow"><input id="copyplanprogress" type="checkbox">
    <span><b>Include teaching progress</b><small>Off by default, so a new year starts with untaught units and no teaching ticks.</small></span>
  </label>
  <p class="sumnote">The copy starts locally on this device. A shared connection is never copied; share the new plan separately when it is ready.</p>`;
}
function openCopyPlan(){
  const source=activeTracker();
  if(!source){ toast("Create a plan first"); return; }
  showSheet("copy",copyPlanHTML(source),"#copyplanname");
  document.getElementById("copyplancancel").onclick=hideSheet;
  document.getElementById("copyplansave").onclick=commitPlanCopy;
  document.getElementById("copyplanname").addEventListener("keydown",event=>{
    if(event.key==="Enter"){ event.preventDefault(); commitPlanCopy(); }
  });
}
function commitPlanCopy(){
  const source=activeTracker();
  if(!source){ hideSheet(); return; }
  const year=+document.getElementById("copyplanyear").value;
  const rawName=document.getElementById("copyplanname").value.trim();
  if(!rawName){ toast("Give the copied plan a name"); document.getElementById("copyplanname").focus(); return; }
  if(year<2020 || year>2100){ toast("Choose a calendar year from 2020 to 2100"); return; }
  const now=new Date().toISOString();
  const next=copyPlan(source,{
    id:fnv1a(rawName+"|"+Date.now()+"|"+Math.random()),
    name:setCalendarYearInName(rawName,year),
    includeProgress:document.getElementById("copyplanprogress").checked,
    now
  });
  track.store.trackers.push(next);
  track.store.active=next.id;
  scopePlanChoice=next.id;
  hideSheet();
  setTracking(true,false);
  applyTrackerYear();
  trackSave(); renderTrackerSelect(); render(); renderScope();
  toast(`Created “${next.name}”`);
}

/* ---------- wiring ---------- */
let nameMode = null;
const TRACK_YEARS = [["","All years"]].concat(YEARS);
let nameYear = "";
function openNameRow(mode){
  const tracker = activeTracker();
  if(mode==="rename" && !tracker){ toast("Create a plan first"); return; }
  nameMode = mode;
  document.getElementById("trknamelabel").textContent = mode==="rename" ? "Rename" : "New plan";
  const input = document.getElementById("trkname");
  input.value = mode==="rename" ? tracker.name : `4B — ${new Date().getFullYear()}`;
  nameYear = mode==="rename" ? (tracker.year || "") : "Year 4";
  const host = document.getElementById("trkyearf");
  host.innerHTML = "";
  radioChips(host, TRACK_YEARS, nameYear, value=>{ nameYear = value; });
  document.getElementById("trknamerow").hidden = false;
  input.focus(); input.select();
}
/* Setting the year on the tracker means nobody has to remember a filter chip on
   another tab, and the unit picker can only ever offer this class's content. */
function applyTrackerYear(){
  const tracker = activeTracker();
  const year = tracker && tracker.year;
  state.year.clear();
  if(year) state.year.add(year);
  document.querySelectorAll("#yearf .chip").forEach(chip=>{
    chip.setAttribute("aria-pressed", !!year && chip.dataset.value === year);
  });
  syncMathsParts();
}
function closeNameRow(){
  nameMode = null;
  document.getElementById("trknamerow").hidden = true;
}
function commitNameRow(){
  const name = document.getElementById("trkname").value.trim();
  if(!name){ toast("Give the plan a name"); return; }
  const tracker = nameMode==="rename" ? activeTracker() : makeTracker(name);
  if(tracker){ tracker.name = name; tracker.year = nameYear; }
  closeNameRow(); applyTrackerYear(); trackSave(); renderTrackerSelect(); render();
  if(tracker && tracker.remote) pushTrackerDetails(tracker);
}
function setTracking(on, offerNewTracker){
  track.on = on;
  document.body.classList.toggle("tracking", on);
  const button = document.getElementById("track");
  button.setAttribute("aria-pressed", on);
  button.textContent = on ? "Tracking on" : "Tracking";
  if(on && offerNewTracker && !track.store.trackers.length) openNameRow("new");
  if(on) applyTrackerYear();
  if(on) attachListener(activeTracker());
  render();
}
document.getElementById("track").addEventListener("click", ()=>setTracking(!track.on, true));
document.getElementById("trksel").addEventListener("change", e=>{
  track.store.active = e.target.value || null;
  applyTrackerYear();
  updateTrackerButtons();
  attachListener(activeTracker());
  trackSave(); render();
});
document.getElementById("trkquicknew").addEventListener("click", ()=>openNameRow("new"));
document.getElementById("trknew").addEventListener("click", ()=>openNameRow("new"));
document.getElementById("trkcopy").addEventListener("click", openCopyPlan);
document.getElementById("trkren").addEventListener("click", ()=>openNameRow("rename"));
document.getElementById("trknameok").addEventListener("click", commitNameRow);
document.getElementById("trknamecancel").addEventListener("click", closeNameRow);
document.getElementById("trkname").addEventListener("keydown", e=>{
  if(e.key==="Enter"){ e.preventDefault(); commitNameRow(); }
  if(e.key==="Escape"){ e.preventDefault(); closeNameRow(); }
});
function removeTracker(tracker){
  const wasShared = !!tracker.remote;
  if(wasShared) detachListener(tracker.remote.code);
  track.store.trackers = track.store.trackers.filter(item=>item.id!==tracker.id);
  if(track.store.active===tracker.id){
    track.store.active = track.store.trackers.length ? track.store.trackers[0].id : null;
  }
  applyTrackerYear();
  trackSave(); renderTrackerSelect(); render();
  /* the shared document itself is left untouched — other teachers keep it */
  toast(wasShared ? `Left “${tracker.name}”` : `Deleted “${tracker.name}”`);
}
let pendingPlanRemoval = null, pendingUnitRemoval = null, confirmReturnFocus = null;
function prepareRemovalConfirmation(title,text,button){
  confirmReturnFocus=document.activeElement;
  document.getElementById("planconfirmtitle").textContent=title;
  document.getElementById("planconfirmtext").textContent=text;
  document.getElementById("planconfirmgo").textContent=button;
  document.getElementById("planconfirm").hidden=false;
  document.body.classList.add("noscroll");
  document.getElementById("planconfirmcancel").focus();
}
function openPlanRemovalConfirmation(tracker=activeTracker()){
  if(!tracker){ toast("No plan to delete"); return; }
  pendingPlanRemoval = tracker.id;
  const shared = !!tracker.remote;
  prepareRemovalConfirmation(`${shared ? "Leave" : "Delete"} “${tracker.name}”?`,shared
      ? "This removes the shared planner from this browser. It does not delete it for anyone else."
      : "This permanently removes all of this planner’s units and teaching ticks from this browser. This cannot be undone.",
    shared ? "Leave planner" : "Delete planner");
}
function openUnitRemovalConfirmation(tracker,id,name){
  pendingUnitRemoval={trackerId:tracker.id,id,name};
  prepareRemovalConfirmation(`Delete “${name}”?`,
    "This removes the unit from the planner. Teaching ticks already recorded from it will be kept.","Delete unit");
}
function closePlanRemovalConfirmation(){
  pendingPlanRemoval = null; pendingUnitRemoval=null;
  document.getElementById("planconfirm").hidden = true;
  if(document.getElementById("summary").hidden) document.body.classList.remove("noscroll");
  const restore=confirmReturnFocus; confirmReturnFocus=null;
  if(restore && restore.isConnected) restore.focus();
}
document.getElementById("trkdel").addEventListener("click", ()=>openPlanRemovalConfirmation());
document.getElementById("planconfirmcancel").addEventListener("click", closePlanRemovalConfirmation);
document.getElementById("planconfirmgo").addEventListener("click", ()=>{
  const tracker = track.store.trackers.find(item=>item.id===pendingPlanRemoval);
  const unit = pendingUnitRemoval ? {...pendingUnitRemoval} : null;
  closePlanRemovalConfirmation();
  if(tracker) removeTracker(tracker);
  if(unit){
    const unitTracker=track.store.trackers.find(item=>item.id===unit.trackerId);
    if(unitTracker && unitTracker.units?.[unit.id]) removeUnit(unitTracker,unit.id);
  }
});
document.getElementById("planconfirm").addEventListener("click", e=>{
  if(e.target.id==="planconfirm") closePlanRemovalConfirmation();
});
document.getElementById("trksum").addEventListener("click", openSummary);
document.getElementById("trkexp").addEventListener("click", trackExport);
document.getElementById("trkimp").addEventListener("click", ()=>document.getElementById("trkfile").click());
document.getElementById("trkfile").addEventListener("change", e=>{
  if(e.target.files && e.target.files[0]) trackImport(e.target.files[0]);
  e.target.value = "";
});
document.getElementById("summary").addEventListener("click", e=>{
  if(e.target.id!=="summary") return;
  if(sheetMode==="unit") closeUnit();
  else if(sheetMode==="toddle") closeToddleReview();
  else hideSheet();
});
function trapDialogFocus(container,event){
  const items=[...container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(item=>!item.hidden && item.getClientRects().length);
  if(!items.length) return;
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey && document.activeElement===first){ event.preventDefault(); last.focus(); }
  else if(!event.shiftKey && document.activeElement===last){ event.preventDefault(); first.focus(); }
  else if(!container.contains(document.activeElement)){ event.preventDefault(); first.focus(); }
}
document.addEventListener("keydown", e=>{
  if(e.key==="Tab" && !document.getElementById("planconfirm").hidden){ trapDialogFocus(document.querySelector("#planconfirm .confirmbox"),e); return; }
  if(e.key==="Tab" && !document.getElementById("summary").hidden){ trapDialogFocus(document.getElementById("sheet"),e); return; }
  if(e.key==="Escape" && !document.getElementById("planconfirm").hidden){
    e.preventDefault(); closePlanRemovalConfirmation(); return;
  }
  if(e.key==="Escape" && !document.getElementById("summary").hidden){
    if(sheetMode==="unit") closeUnit();
    else if(sheetMode==="toddle") closeToddleReview();
    else hideSheet();
  }
});

trackLoad();
renderTrackerSelect();
radioChips(document.getElementById("trktermf"),
  TRACK_TERMS.map(([value])=>[value,value]), track.term, value=>{
  track.term = value;
  track.store.term = value;
  trackSave();
  updateTrackerLabels();
});
document.querySelectorAll("#trktermf .chip").forEach(tile=>{
  const label = (TRACK_TERMS.find(([value])=>value===tile.dataset.value) || [,"Term"])[1];
  tile.setAttribute("aria-label", "Record new ticks as " + label);
  tile.title = label;
});
document.getElementById("hidetaught").addEventListener("click", ()=>{
  track.view = track.view === "todo" ? "all" : "todo";
  render();
});

/* ---------- shared trackers ---------- */
/* Paste the Firebase web config here to switch sharing on. These values are not
   secrets — they identify the project, they do not grant access. All protection
   comes from firestore.rules. Until this is filled in, Share and Join simply
   report that sharing is not set up, and no Firebase code is ever fetched. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBoAEdMs7SdMlLYZDRPhFBSG-O4zJ2Ozn0",
  authDomain: "syllabus-tracker-daa69.firebaseapp.com",
  projectId: "syllabus-tracker-daa69",
  appId: "1:881611074233:web:f9dab82f6d9538fdd84968"
};
const FIREBASE_VERSION = "10.14.1";
/* no 0/o/1/l/i, so a code read aloud or copied off a whiteboard is unambiguous */
const SHARE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

const shareConfigured = () => !/^PASTE_/.test(FIREBASE_CONFIG.apiKey);

function makeShareCode(){
  const out = [];
  const buf = new Uint8Array(1);
  const limit = 256 - (256 % SHARE_ALPHABET.length);
  while(out.length < 16){
    crypto.getRandomValues(buf);
    /* reject the tail of the byte range so every letter stays equally likely */
    if(buf[0] >= limit) continue;
    out.push(SHARE_ALPHABET[buf[0] % SHARE_ALPHABET.length]);
  }
  return out.join("").replace(/(.{4})(?=.)/g, "$1-");
}

/* The SDK is fetched on first use, never on page load, so the page stays a
   single self-contained file for anyone who only tracks locally. */
let firebasePromise = null;
function firebaseReady(){
  if(firebasePromise) return firebasePromise;
  firebasePromise = (async ()=>{
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    const [appMod, authMod, store] = await Promise.all([
      import(base+"firebase-app.js"),
      import(base+"firebase-auth.js"),
      import(base+"firebase-firestore.js")
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    await authMod.signInAnonymously(authMod.getAuth(app));
    const db = store.initializeFirestore(app, {localCache: store.persistentLocalCache({})});
    return {store, db};
  })();
  firebasePromise.catch(()=>{ firebasePromise = null; });
  return firebasePromise;
}
const trackerRef = (fb, code) => fb.store.doc(fb.db, "trackers", code);

const remoteListeners = new Map();
async function attachListener(tracker){
  if(!tracker || !tracker.remote || !shareConfigured()) return;
  if(remoteListeners.has(tracker.remote.code)) return;
  try{
    const fb = await firebaseReady();
    const stop = fb.store.onSnapshot(trackerRef(fb, tracker.remote.code),
      snapshot=>{ if(snapshot.exists()) applyRemote(tracker, snapshot.data()); },
      ()=>{ syncFailed=true; setSaved("Sync problem — local copy kept", true); });
    remoteListeners.set(tracker.remote.code, stop);
  }catch(_){ syncFailed=true; setSaved("Sync problem — local copy kept", true); }
}
function detachListener(code){
  const stop = remoteListeners.get(code);
  if(stop){ stop(); remoteListeners.delete(code); }
}

/* Repaint only what actually changed. A full render() here would throw away
   scroll position and keyboard focus while a teacher is mid-list. */
function applyRemote(tracker, data){
  const live = tracker === activeTracker();
  let changed = 0;
  ["fa","pt"].forEach(kind=>{
    const isPoint = kind === "pt";
    const incoming = data[kind] || {};
    const current = tracker[kind];
    Object.keys(incoming).forEach(key=>{
      if(!current[key] || current[key].t !== incoming[key].t){
        current[key] = incoming[key];
        changed++;
        if(live) paintTick(key, isPoint);
      }
    });
    Object.keys(current).forEach(key=>{
      if(!incoming[key]){
        delete current[key];
        changed++;
        if(live) paintTick(key, isPoint);
      }
    });
  });
  const incomingUnits = data.units || {};
  if(!tracker.units) tracker.units = {};
  Object.keys(incomingUnits).forEach(id=>{
    if(stableJSON(tracker.units[id]) !== stableJSON(incomingUnits[id])){
      tracker.units[id] = incomingUnits[id];
      changed++;
    }
  });
  Object.keys(tracker.units).forEach(id=>{
    if(!incomingUnits[id]){ delete tracker.units[id]; changed++; }
  });
  if(data.name && data.name !== tracker.name){
    tracker.name = data.name;
    renderTrackerSelect();
  }
  if(data.year !== undefined && data.year !== tracker.year){
    tracker.year = data.year;
    if(live){ applyTrackerYear(); changed++; }
  }
  if(!changed) return;
  trackSave();
  if(live && !document.getElementById("scope-view").hidden) renderScope();
  /* a card may now belong on the other side of the taught / not-yet filter */
  if(live && track.view !== "all") render();
  else if(live) updateProgress(matches());
  if(!syncFailed) setSaved("Shared live", false, true);
}

async function pushTick(tracker, key, isPoint, value){
  try{
    const fb = await firebaseReady();
    /* Most keys start with a digit, which makes dotted string paths invalid —
       FieldPath sidesteps parsing entirely. */
    const path = new fb.store.FieldPath(isPoint ? "pt" : "fa", key);
    await fb.store.updateDoc(trackerRef(fb, tracker.remote.code),
      path, value === null ? fb.store.deleteField() : value,
      "updated", new Date().toISOString());
    noteSyncOk();
  }catch(_){
    noteSyncFailure("That tick");
  }
}

async function shareTracker(){
  const tracker = activeTracker();
  if(!tracker){ toast("Create a plan first"); return; }
  if(tracker.remote){
    openShareRow("share", tracker.remote.code);
    copy(shareLink(tracker.remote.code), "Share link copied");
    return;
  }
  if(!shareConfigured()){ toast("Sharing is not set up yet"); return; }
  setSaved("Sharing…", false);
  try{
    const fb = await firebaseReady();
    const code = makeShareCode();
    await fb.store.setDoc(trackerRef(fb, code), {
      name: tracker.name, created: tracker.created,
      updated: new Date().toISOString(), fa: tracker.fa, pt: tracker.pt,
      /* the year group scopes every teammate's content picker, not just the owner's */
      year: tracker.year || "",
      /* a year may already be planned before anyone thinks to share it */
      units: tracker.units || {}
    });
    tracker.remote = {code};
    trackSave(); renderTrackerSelect(); attachListener(tracker);
    openShareRow("share", code);
    copy(shareLink(code), "Share link copied — send it to your team");
  }catch(_){
    toast("Could not share — check your connection");
    setSaved("Sync problem — local copy kept", true);
  }
}

async function joinTracker(raw){
  /* accept a pasted share link just as readily as a bare code */
  const code = (raw || "").trim().toLowerCase().replace(/^.*[#&]join=/, "").replace(/[^a-z0-9-].*$/, "");
  if(!code){ toast("Paste a share code"); return; }
  if(!shareConfigured()){ toast("Sharing is not set up yet"); return; }
  const already = track.store.trackers.find(t=>t.remote && t.remote.code===code);
  if(already){
    track.store.active = already.id;
    trackSave(); renderTrackerSelect(); render(); closeShareRow();
    toast("You are already in that plan");
    return;
  }
  try{
    const fb = await firebaseReady();
    const snapshot = await fb.store.getDoc(trackerRef(fb, code));
    if(!snapshot.exists()){ toast("No plan with that code"); return; }
    const data = snapshot.data();
    const now = new Date().toISOString();
    const tracker = {id:fnv1a(code), name:data.name || "Shared plan",
                     created:data.created || now, updated:data.updated || now,
                     year:data.year || "",
                     fa:data.fa || {}, pt:data.pt || {}, units:data.units || {},
                     remote:{code}};
    track.store.trackers.push(tracker);
    track.store.active = tracker.id;
    trackSave(); applyTrackerYear(); renderTrackerSelect(); render(); attachListener(tracker);
    closeShareRow();
    toast(`Joined “${tracker.name}”`);
  }catch(_){
    toast("Could not join — check the code and your connection");
  }
}

/* ---------- share row ---------- */
function openShareRow(mode, code){
  const input = document.getElementById("trksharecode");
  document.getElementById("trksharelabel").textContent = mode==="share" ? "Share link" : "Join a plan";
  /* the field shows the link, because that is the thing people recognise and send */
  document.getElementById("trksharerow").dataset.code = code || "";
  input.value = mode==="share" && code ? shareLink(code) : "";
  input.readOnly = mode === "share";
  input.placeholder = mode==="share" ? "" : "paste the link or code a colleague sent you";
  document.getElementById("trkshareok").hidden = mode === "share";
  document.getElementById("trksharecopy").hidden = mode !== "share";
  document.getElementById("trksharelink").hidden = mode !== "share";
  document.getElementById("trksharemsg").textContent = mode==="share"
    ? "Shared live. Anyone with this link can join and edit. Export a backup before leaving if you need a separate copy."
    : "Paste the link or code a colleague sent you.";
  document.getElementById("trksharerow").hidden = false;
  input.focus();
  if(mode==="share"){
    input.select();
    /* selecting scrolls to the end, which makes a link read as a bare code */
    input.scrollLeft = 0;
  }
}
function closeShareRow(){
  document.getElementById("trksharerow").hidden = true;
}
const shareLink = code => location.origin + location.pathname + "#join=" + code;

/* Someone opening a shared link should land straight in the tracker, without
   having to discover the Tracking button first. */
function joinFromLink(){
  const match = location.hash.match(/[#&]join=([a-z0-9-]+)/i);
  if(!match) return;
  /* drop the code from the address bar so a refresh does not re-join */
  history.replaceState(null, "", location.pathname + location.search);
  setTracking(true, false);
  joinTracker(match[1].toLowerCase());
}
joinFromLink();

document.getElementById("trkshare").addEventListener("click", shareTracker);
document.getElementById("trkjoin").addEventListener("click", ()=>openShareRow("join",""));
document.getElementById("trkshareok").addEventListener("click", ()=>
  joinTracker(document.getElementById("trksharecode").value));
document.getElementById("trksharecopy").addEventListener("click", ()=>
  copy(document.getElementById("trksharerow").dataset.code, "Share code copied"));
document.getElementById("trksharelink").addEventListener("click", ()=>
  copy(document.getElementById("trksharecode").value, "Share link copied"));
document.getElementById("topjoin").addEventListener("click", ()=>{
  if(!track.on) setTracking(true, false);
  closeNameRow();
  openShareRow("join", "");
});
document.getElementById("trksharecancel").addEventListener("click", closeShareRow);
document.getElementById("trksharecode").addEventListener("keydown", e=>{
  if(e.key==="Enter" && !e.target.readOnly){ e.preventDefault(); joinTracker(e.target.value); }
  if(e.key==="Escape"){ e.preventDefault(); closeShareRow(); }
});

/* ---------- scope and sequence ---------- */
const SCOPE_MAX_WEEK = 11;
const unitsOf = tracker => (tracker && tracker.units) || {};

/* key order differs between a local object and the same object back from Firestore,
   so compare canonically rather than by raw JSON */
function stableJSON(value){
  if(value === null || typeof value !== "object") return JSON.stringify(value);
  if(Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  return "{" + Object.keys(value).sort()
    .map(k=>JSON.stringify(k) + ":" + stableJSON(value[k])).join(",") + "}";
}
const termLabel = t => (TRACK_TERMS.find(([value])=>value===t) || [,"Term 1"])[1];
const unitWeeks = u => !u.wkFrom ? ""
  : (u.wkTo && u.wkTo !== u.wkFrom) ? `Wk ${u.wkFrom}–${u.wkTo}` : `Wk ${u.wkFrom}`;
const unitCount = u => Object.keys(u.fa||{}).length + Object.keys(u.pt||{}).length;
let scopeMobileTerm = "T1";

function unitButtonHTML(id,u){
  const weeks = unitWeeks(u);
  const spans = Object.keys(u.klas||{}).length;
  const points = unitCount(u);
  return `<button class="unit${u.taught?" taught":""}" type="button" data-unit="${id}">
    <span class="un">${esc(u.name || "Untitled unit")}</span>
    <span class="um">` +
    (weeks ? `<span>${weeks}</span>` : "") +
    (spans > 1 ? `<span>${spans} areas</span>` : "") +
    (points ? `<span>${points} content</span>` : "") +
    (u.taught ? `<span class="ut">&#10003; ${esc(u.taught)}</span>` : "") +
    `</span></button>`;
}

/* ---------- the grid ---------- */
function renderScope(){
  const host = document.getElementById("scopeout");
  const meter = document.getElementById("scopemeter");
  const printBtn = document.getElementById("scopeprint");
  const tracker = activeTracker();
  if(!track.on || !tracker){
    host.innerHTML = scopeStartHTML();
    meter.textContent = "";
    printBtn.hidden = true;
    return;
  }
  const units = Object.entries(unitsOf(tracker));
  const taught = units.filter(([,u])=>u.taught).length;
  meter.innerHTML = `<b>${units.length}</b> unit${units.length===1?"":"s"} planned` +
    (units.length ? ` &middot; <b>${taught}</b> marked taught` : "");
  printBtn.hidden = !units.length;

  let h = `<div class="scopewrap scope-desktop"><table class="scopegrid"><thead><tr><th>Syllabus</th>`;
  TRACK_TERMS.forEach(([,label])=>{ h += `<th>${esc(label)}</th>`; });
  h += `</tr></thead><tbody>`;
  KLAS.forEach(([k,label])=>{
    h += `<tr style="--kla:var(--${k})"><th>${esc(label)}</th>`;
    TRACK_TERMS.forEach(([term])=>{
      const cell = units
        .filter(([,u])=>u.term===term && u.klas && u.klas[k])
        .sort((a,b)=>(a[1].wkFrom||99)-(b[1].wkFrom||99) || a[1].name.localeCompare(b[1].name));
      h += `<td class="scopecell">`;
      cell.forEach(([id,u])=>{ h += unitButtonHTML(id,u); });
      h += `<button class="addunit" type="button" data-add="${k}|${term}">+ Unit</button></td>`;
    });
    h += `</tr>`;
  });
  h += `</tbody></table></div>`;

  h += `<div class="scopemobile">
    <div class="scope-termtiles" role="group" aria-label="Term to display">`+
    TRACK_TERMS.map(([term])=>`<button class="chip" type="button" data-scope-term="${term}"
      aria-pressed="${scopeMobileTerm===term}">${term}</button>`).join("") + `</div>`;
  KLAS.forEach(([k,label])=>{
    const cell = units
      .filter(([,u])=>u.term===scopeMobileTerm && u.klas && u.klas[k])
      .sort((a,b)=>(a[1].wkFrom||99)-(b[1].wkFrom||99) || a[1].name.localeCompare(b[1].name));
    h += `<section class="scope-mobile-kla" style="--kla:var(--${k})">
      <div class="scope-mobile-head"><h3>${esc(label)}</h3><span>${cell.length} unit${cell.length===1?"":"s"}</span></div>
      <div class="scope-mobile-units">`;
    cell.forEach(([id,u])=>{ h += unitButtonHTML(id,u); });
    h += `<button class="addunit" type="button" data-add="${k}|${scopeMobileTerm}">+ Unit</button>
      </div></section>`;
  });
  host.innerHTML = h + `</div>`;
}

/* ---------- getting started ---------- */
/* Returning teachers can resume a saved plan. For a new plan, guided asks two
   questions on their own screens while self-setup reuses the name-and-year row. */
let scopeSetup = null, scopePlanChoice = null;
function scopeStartHTML(){
  if(!scopeSetup){
    const plans = track.store.trackers;
    const activeId = plans.some(plan=>plan.id===scopePlanChoice) ? scopePlanChoice
      : plans.some(plan=>plan.id===track.store.active) ? track.store.active
      : (plans[0] && plans[0].id);
    const resume = plans.length ? `<div class="startresume">
      <label class="startstep" for="scopeplanselect">Continue with your planning for&hellip;</label>
      <div class="startresume-row">
        <select class="uinput startplan" id="scopeplanselect">` + plans.map(plan=>{
          const count = Object.keys(unitsOf(plan)).length;
          const details = [plan.year, `${count} unit${count===1?"":"s"}`].filter(Boolean).join(" \u00b7 ");
          return `<option value="${esc(plan.id)}"${plan.id===activeId?" selected":""}>${esc(plan.name)}${details?" \u2014 "+esc(details):""}</option>`;
        }).join("") + `</select>
        <button class="startdelete" type="button" data-start-delete
          aria-label="Delete selected planner" title="Delete selected planner">&times;</button>
        <button class="btn primary" type="button" data-start="continue">Continue planning</button>
      </div>
    </div><div class="startor">or start something new</div>` : "";
    return `<div class="startcard">
      <h2>${plans.length ? "Welcome back" : "Plan your year"}</h2>
      <p class="startlead">${plans.length
        ? "Pick up an existing scope and sequence, or start a new one."
        : "A scope and sequence lays your units of work across the four terms, and links each one to the syllabus content it covers."}</p>
      ${resume}
      <div class="startopts">
        <button class="startopt" type="button" data-start="guided">
          <span class="so-t">Guided setup</span>
          <span class="so-d">Two questions, then straight into your planner.</span>
        </button>
        <button class="startopt" type="button" data-start="self">
          <span class="so-t">Set it up myself</span>
          <span class="so-d">One line to fill in, then an empty planner.</span>
        </button>
        <button class="startopt" type="button" data-start="toddle">
          <span class="so-t">Import from Toddle</span>
          <span class="so-d">Already planned your units? Bring them straight in,
            with their syllabus content attached.</span>
        </button>
      </div>
    </div>`;
  }
  if(scopeSetup.step === "year"){
    return `<div class="startcard">
      <div class="startstep">Step 1 of 2</div>
      <h2>Which year are you planning?</h2>
      <div class="startchips">` + YEARS.map(([value,label])=>
        `<button class="chip startchip" type="button" data-year="${esc(value)}"
           aria-pressed="${scopeSetup.year===value}">${esc(label)}</button>`).join("") + `</div>
      <p class="startlead">This keeps the planner to your stage, so you are never offered
        content from another year.</p>
      <div class="startacts">
        <button class="btn" type="button" data-start="cancel">Cancel</button>
        <button class="btn primary" type="button" data-start="toname"
          ${scopeSetup.year ? "" : "disabled"}>Next</button>
      </div>
    </div>`;
  }
  return `<div class="startcard">
    <div class="startstep">Step 2 of 2</div>
    <h2>What should this plan be called?</h2>
    <p class="startlead">Something you will recognise next year — a class and a year works well.</p>
    <input class="uinput startname" id="startname" type="text" autocomplete="off"
      value="${esc(scopeSetup.name)}" placeholder="e.g. 4B — 2026">
    <div class="startacts">
      <button class="btn" type="button" data-start="back">Back</button>
      <button class="btn primary" type="button" data-start="create">Start planning</button>
    </div>
  </div>`;
}
function createPlan(year, name){
  const plan = makeTracker(name.trim() || ("My plan — " + new Date().getFullYear()));
  plan.year = year || "";
  scopePlanChoice = plan.id;
  scopeSetup = null;
  setTracking(true, false);   /* internal: the word "tracking" is never shown */
  applyTrackerYear();
  trackSave(); renderTrackerSelect(); render(); renderScope();
  toast("Plan created — choose a term and add your first unit");
}

/* ---------- unit editor ---------- */
let unitDraft = null, unitDraftId = null;
const attachedOpen = new Set();

function openUnit(id, preset){
  const tracker = activeTracker();
  if(!tracker){ toast("Create a plan first"); return; }
  const existing = id ? unitsOf(tracker)[id] : null;
  attachedOpen.clear();
  unitDraftId = id || fnv1a("u|" + Date.now() + "|" + Math.random());
  unitDraft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {name:"", term:preset.term, wkFrom:"", wkTo:"", klas:{[preset.kla]:true}, fa:{}, pt:{}, taught:null};
  if(!unitDraft.klas) unitDraft.klas = {};
  if(!unitDraft.fa) unitDraft.fa = {};
  if(!unitDraft.pt) unitDraft.pt = {};
  showSheet("unit",unitSheetHTML(!!existing),"#uname");
  wireUnitSheet(!!existing);
}
function closeUnit(){
  unitDraft = null; unitDraftId = null;
  hideSheet();
}
function unitSheetHTML(existing){
  return `<div class="sheethead">
    <div>
      <h2 id="sheettitle">${existing ? "Edit unit" : "New unit"}</h2>
      <div class="sheetmeta">${esc(termLabel(unitDraft.term))} &middot; ${esc(activeTracker().name)}</div>
    </div>
    <div class="sheetacts">
      <button class="sheetbtn primary" id="usave" type="button">Save</button>
      <button class="sheetbtn" id="uclose" type="button">Cancel</button>
    </div>
  </div>
  <div class="ufield">
    <label class="ulabel" for="uname">Unit name</label>
    <input class="uinput" id="uname" type="text" autocomplete="off"
      placeholder="e.g. Sharing the Planet" value="${esc(unitDraft.name)}">
  </div>
  <div class="ufield">
    <div class="urow">
      <span class="ulabel" style="margin:0">Weeks</span>
      <input class="uinput uweek" id="uwkfrom" type="number" min="1" max="${SCOPE_MAX_WEEK}"
        value="${unitDraft.wkFrom||""}" aria-label="First week">
      <span style="color:var(--ink-3)">to</span>
      <input class="uinput uweek" id="uwkto" type="number" min="1" max="${SCOPE_MAX_WEEK}"
        value="${unitDraft.wkTo||""}" aria-label="Last week">
      <span class="utaughtnote">Optional. Maths often sits outside the unit of inquiry.</span>
    </div>
  </div>
  <div class="ufield">
    <span class="ulabel">Term</span>
    <div class="urow" id="utermf"></div>
  </div>
  <div class="ufield">
    <span class="ulabel">Syllabuses this unit covers</span>
    <div class="urow" id="uklaf"></div>
  </div>
  <div class="ufield">
    <span class="ulabel">Syllabus content in this unit (<span id="ucount">0</span>)</span>
    <div class="upicked" id="uattached"></div>
  </div>
  <div class="ufield">
    <label class="ulabel" for="uq">Add content from the syllabus</label>
    <input class="uinput" id="uq" type="search" autocomplete="off"
      placeholder="Filter this list, e.g. fractions">
    <div class="upicked" id="uresults" style="margin-top:9px"></div>
  </div>
  <div class="usheetacts">
    <button class="sheetbtn primary" id="umark" type="button"></button>
    <span class="utaughtnote" id="unote"></span>
    ${existing ? '<button class="sheetbtn" id="uduplicate" type="button">Duplicate unit</button><button class="sheetbtn udanger" id="udelete" type="button">Delete unit</button>' : ''}
  </div>`;
}
function wireUnitSheet(existing){
  const termHost = document.getElementById("uklaf");
  const termChipHost = document.getElementById("utermf");
  if(termChipHost) radioChips(termChipHost, TRACK_TERMS, unitDraft.term, value=>{
    unitDraft.term = value;
    const meta = document.querySelector("#sheet .sheetmeta");
    if(meta) meta.innerHTML = esc(termLabel(value)) + " &middot; " + esc(activeTracker().name);
  });
  KLAS.forEach(([k,label])=>{
    const b = document.createElement("button");
    b.className = "uchip"; b.type = "button"; b.dataset.value = k;
    b.setAttribute("aria-pressed", !!unitDraft.klas[k]);
    b.innerHTML = `<span class="dot" style="background:var(--${k})"></span>${esc(label)}`;
    b.onclick = ()=>{
      if(unitDraft.klas[k]) delete unitDraft.klas[k]; else unitDraft.klas[k] = true;
      b.setAttribute("aria-pressed", !!unitDraft.klas[k]);
      renderUnitResults();
    };
    termHost.appendChild(b);
  });
  document.getElementById("uname").addEventListener("input", e=>{ unitDraft.name = e.target.value; });
  document.getElementById("uwkfrom").addEventListener("input", e=>{ unitDraft.wkFrom = clampWeek(e.target.value); });
  document.getElementById("uwkto").addEventListener("input", e=>{ unitDraft.wkTo = clampWeek(e.target.value); });
  let pickTimer;
  document.getElementById("uq").addEventListener("input", ()=>{
    clearTimeout(pickTimer); pickTimer = setTimeout(renderUnitResults, 160);
  });
  document.getElementById("usave").addEventListener("click", saveUnit);
  document.getElementById("uclose").addEventListener("click", closeUnit);
  document.getElementById("umark").addEventListener("click", toggleUnitTaught);
  if(existing){
    document.getElementById("uduplicate").addEventListener("click", duplicateUnitDraft);
    document.getElementById("udelete").addEventListener("click", deleteUnit);
  }
  /* update the one button rather than rebuilding the list, so adding several
     items in a row does not scroll the results out from under you */
  document.getElementById("uattached").addEventListener("toggle", e=>{
    const details = e.target;
    if(!details.matches || !details.matches(".uattached-points[data-fk]")) return;
    details.open ? attachedOpen.add(details.dataset.fk) : attachedOpen.delete(details.dataset.fk);
  }, true);
  document.getElementById("uattached").addEventListener("click", e=>{
    const remove = e.target.closest("[data-drop]");
    if(!remove) return;
    const [kind,key] = remove.dataset.drop.split("|");
    delete unitDraft[kind][key];
    renderUnitAttached();
    const button = document.querySelector("#uresults [data-attach='" + kind + "|" + key + "']");
    if(button){ button.disabled = false; button.textContent = kind==="fa" ? "+ focus area" : "+ point"; }
  });
  /* a content point is meaningless without the outcome it sits under, so attaching
     one attaches its focus area too. Removing a point leaves the area alone. */
  function attachPoint(key){
    unitDraft.pt[key] = true;
    const parent = PT_BY_KEY.get(key);
    if(parent) unitDraft.fa[parent.r._fk] = true;
  }
  document.getElementById("uresults").addEventListener("click", e=>{
    const group = e.target.closest("[data-attachgroup]");
    if(group && !group.disabled){
      group.dataset.attachgroup.split(",").forEach(key=>{
        attachPoint(key);
        const button = document.querySelector("#uresults [data-attach='pt|" + key + "']");
        if(button){ button.disabled = true; button.textContent = "added"; }
      });
      group.disabled = true; group.textContent = "all added";
      renderUnitAttached();
      return;
    }
    const add = e.target.closest("[data-attach]");
    if(!add || add.disabled) return;
    const [kind,key] = add.dataset.attach.split("|");
    if(kind === "pt") attachPoint(key); else unitDraft[kind][key] = true;
    add.disabled = true; add.textContent = "added";
    /* the parent may have just been attached behind the scenes */
    const parentBtn = kind === "pt" && PT_BY_KEY.get(key)
      ? document.querySelector("#uresults [data-attach='fa|" + PT_BY_KEY.get(key).r._fk + "']") : null;
    if(parentBtn && !parentBtn.disabled){ parentBtn.disabled = true; parentBtn.textContent = "added"; }
    renderUnitAttached();
  });
  renderUnitAttached();
  renderUnitResults();
  document.getElementById("uname").focus();
}
function duplicateUnitDraft(){
  unitDraft=duplicateUnit(unitDraft);
  unitDraftId=fnv1a("u|"+Date.now()+"|"+Math.random());
  document.getElementById("sheet").innerHTML=unitSheetHTML(false);
  wireUnitSheet(false);
  const name=document.getElementById("uname");
  name.focus(); name.select();
  toast("Unit copied — choose its term and save");
}
const clampWeek = v => {
  const n = parseInt(v,10);
  return (!n || n < 1) ? "" : Math.min(n, SCOPE_MAX_WEEK);
};

function renderUnitAttached(){
  const host = document.getElementById("uattached");
  const total = Object.keys(unitDraft.fa).length + Object.keys(unitDraft.pt).length;

  /* Nest points under the focus area they belong to. A flat list mixes outcomes
     and content points into an unreadable run once a unit has more than a few. */
  const groups = new Map();
  const orphans = [];
  const group = r => {
    if(!groups.has(r._fk)) groups.set(r._fk, {r, attached:false, points:[]});
    return groups.get(r._fk);
  };
  Object.keys(unitDraft.fa).forEach(key=>{
    const r = FA_BY_KEY.get(key);
    if(!r){ orphans.push({kind:"fa", key}); return; }
    group(r).attached = true;
  });
  Object.keys(unitDraft.pt).forEach(key=>{
    const hit = PT_BY_KEY.get(key);
    if(!hit){ orphans.push({kind:"pt", key}); return; }
    group(hit.r).points.push({key, it:hit.it, g:hit.g});
  });

  const ordered = [...groups.values()].sort((a,b)=>
    (KLA_ORDER.get(a.r.k) ?? 99) - (KLA_ORDER.get(b.r.k) ?? 99) ||
    (STAGE_ORDER.get(a.r.st) ?? 99) - (STAGE_ORDER.get(b.r.st) ?? 99) || a.r._i - b.r._i);
  ordered.forEach(entry=>{
    /* keep points in syllabus order, not the order they happened to be clicked */
    const order = [];
    entry.r.g.forEach(g=>g.i.forEach(it=>order.push(it._pk)));
    entry.points.sort((a,b)=>order.indexOf(a.key) - order.indexOf(b.key));
  });

  document.getElementById("ucount").textContent = total;
  document.getElementById("umark").textContent = unitDraft.taught
    ? "Unmark as taught" : "Mark this unit taught";
  document.getElementById("unote").textContent = unitDraft.taught
    ? `Ticked as ${unitDraft.taught}. Unmarking removes only the ticks this unit added.`
    : total ? `Ticks all ${total} as ${unitDraft.term}.`
            : "Attach some content first.";

  if(!total){
    host.innerHTML = `<p class="upickhint">Nothing attached yet. Pick content from the list below.</p>`;
    return;
  }
  host.innerHTML = ordered.map(entry=>{
    const codes = entry.r.o.filter(o=>o.c).map(o=>o.c).join(" ");
    return `<div class="upick uparent">
        <span class="uk">${esc(entry.r.sh)}</span>
        <span><b>${esc(entry.r.t)}</b> <span style="color:var(--ink-3)">${esc(entry.r.kla)}</span>` +
        (codes ? ` <span class="ucodes">${esc(codes)}</span>` : "") +
        `</span>` +
        (entry.attached
          ? `<button class="ux" type="button" data-drop="fa|${entry.r._fk}"
               aria-label="Remove this focus area" style="margin-left:auto">&times;</button>`
          : `<span class="uonlypoints" style="margin-left:auto">points only</span>`) +
      `</div>` +
      (entry.points.length
        ? `<details class="uattached-points" data-fk="${entry.r._fk}"` +
          `${attachedOpen.has(entry.r._fk) ? " open" : ""}>` +
          `<summary>${entry.points.length} content point${entry.points.length===1?"":"s"}</summary>` +
          entry.points.map(p=>
            `<div class="upick uchild">
              <span>${esc(p.it.t)}</span>
              <button class="ux" type="button" data-drop="pt|${p.key}"
                aria-label="Remove this content point" style="margin-left:auto">&times;</button>
            </div>`).join("") + `</details>`
        : "");
  }).join("") +
  orphans.map(o=>
    `<div class="upick">
      <span class="uk">?</span>
      <span style="color:var(--ink-3)">Content no longer in this syllabus &mdash; kept, not deleted</span>
      <button class="ux" type="button" data-drop="${o.kind}|${o.key}"
        aria-label="Remove" style="margin-left:auto">&times;</button>
    </div>`).join("");
}

function renderUnitResults(){
  const host = document.getElementById("uresults");
  const words = document.getElementById("uq").value.trim().toLowerCase()
    .split(/\s+/).filter(w=>w.length>1);
  const klas = Object.keys(unitDraft.klas);
  if(!klas.length){
    host.innerHTML = `<p class="upickhint">Choose at least one syllabus above.</p>`;
    return;
  }
  /* Browse by default. Once a year group and learning areas are chosen the list is
     short — Stage 2 has 2 HSIE focus areas, 4 in Creative Arts — so making anyone
     guess a search term first was asking them to work for nothing. Search filters. */
  const tracker = activeTracker();
  const year = tracker && tracker.year;
  const found = DATA.filter(r=>{
    if(!klas.includes(r.k)) return false;
    if(year && !r._years.includes(year)) return false;
    return words.every(w=>r._s.includes(w));
  }).sort((a,b)=>
    (KLA_ORDER.get(a.k) ?? 99) - (KLA_ORDER.get(b.k) ?? 99) ||
    (STAGE_ORDER.get(a.st) ?? 99) - (STAGE_ORDER.get(b.st) ?? 99) || a._i - b._i
  ).slice(0, 60);
  if(!found.length){
    const areas = klas.map(k=>KLAS.find(([key])=>key===k)[1]).join(", ");
    /* syllabus wording rarely matches staffroom wording — "geography" misses
       "geographical" — so always say what clearing the filter would show */
    const whole = words.length ? DATA.filter(r=>klas.includes(r.k) &&
      (!year || r._years.includes(year))).length : 0;
    host.innerHTML = `<p class="upickhint">      ${words.length ? `Nothing matches that filter. Clear it to see all ${whole} in ${esc(areas)}.`                     : `Nothing in ${esc(areas)}${year?" for "+esc(year):""}.`}</p>`;
    return;
  }
  host.innerHTML = found.map(r=>{
    const already = !!unitDraft.fa[r._fk];
    const codes = r.o.filter(o=>o.c).map(o=>o.c).join(" ");
    const total = r.g.reduce((a,g)=>a+g.i.length, 0);
    return `<div class="upick">
        <span class="uk">${esc(r.sh)}</span>
        <span><b>${esc(r.t)}</b>` +
        (codes ? ` <span class="ucodes">${esc(codes)}</span>` : "") +
        `</span>
        <button class="uadd" type="button" data-attach="fa|${r._fk}" style="margin-left:auto"
          ${already?"disabled":""}>${already?"added":"+ focus area"}</button>
      </div>` +
      (total ? `<details class="upoints"><summary>${total} content point${total===1?"":"s"}</summary>` +
        /* keep NESA's content groups, as the Syllabus content tab does — 54 points
           in one flat list is unreadable, the same points under their headings are not */
        r.g.map(g=>{
          const keys = g.i.map(it=>it._pk);
          const allOn = keys.every(k=>unitDraft.pt[k]);
          return `<div class="ugroup">
              <span>${esc(g.t)}</span>
              <button class="uadd" type="button" data-attachgroup="${keys.join(",")}"
                style="margin-left:auto" ${allOn?"disabled":""}>${allOn?"all added":"+ all "+keys.length}</button>
            </div>` +
            g.i.map(it=>{
              const on = !!unitDraft.pt[it._pk];
              return `<div class="upick" style="padding-left:20px">
                <span>${esc(it.t)}</span>
                <button class="uadd" type="button" data-attach="pt|${it._pk}" style="margin-left:auto"
                  ${on?"disabled":""}>${on?"added":"+ point"}</button>
              </div>`;
            }).join("");
        }).join("") + `</details>` : "");
  }).join("");
}

/* ---------- saving ---------- */
function saveUnit(){
  const tracker = activeTracker();
  if(!unitDraft.name.trim()){ toast("Give the unit a name"); document.getElementById("uname").focus(); return; }
  if(!Object.keys(unitDraft.klas).length){ toast("Choose at least one learning area"); return; }
  if(!tracker.units) tracker.units = {};
  tracker.units[unitDraftId] = JSON.parse(JSON.stringify(unitDraft));
  trackSave();
  pushUnit(tracker, unitDraftId, tracker.units[unitDraftId], []);
  const name = unitDraft.name;
  closeUnit(); renderScope();
  toast(`Saved “${name}”`);
}
function deleteUnit(){
  const tracker = activeTracker();
  openUnitRemovalConfirmation(tracker,unitDraftId,unitDraft.name || "Untitled unit");
}
function removeUnit(tracker,id){
  /* ticks stay: the teaching still happened, even if the plan is gone */
  delete tracker.units[id];
  trackSave();
  pushUnit(tracker, id, null, []);
  closeUnit(); renderScope();
  toast("Unit deleted. Its ticks were kept.");
}
function toggleUnitTaught(){
  const tracker = activeTracker();
  if(!tracker.units || !tracker.units[unitDraftId]) saveUnitQuietly(tracker);
  const unit = tracker.units[unitDraftId];
  const pairs = [];
  if(unit.taught){
    /* remove only what this unit added, never a tick made by hand */
    ["fa","pt"].forEach(kind=>{
      Object.keys((unit.added && unit.added[kind]) || {}).forEach(key=>{
        if(tracker[kind][key]){ delete tracker[kind][key]; pairs.push([kind,key,null]); }
      });
    });
    unit.taught = null; unit.added = null;
    toast("Unit unmarked");
  } else {
    const added = {fa:{}, pt:{}};
    ["fa","pt"].forEach(kind=>{
      Object.keys(unit[kind] || {}).forEach(key=>{
        if(tracker[kind][key]) return;   // already ticked: leave it, and do not claim it
        tracker[kind][key] = {t:unit.term};
        added[kind][key] = true;
        pairs.push([kind,key,{t:unit.term}]);
      });
    });
    unit.taught = unit.term;
    unit.added = added;
    toast(`Ticked ${pairs.length} content item${pairs.length===1?"":"s"} as ${unit.term}`);
  }
  unitDraft.taught = unit.taught;
  unitDraft.added = unit.added;
  trackSave();
  pushUnit(tracker, unitDraftId, unit, pairs);
  renderUnitAttached();
  renderScope();
  updateProgress(matches());
  if(!document.getElementById("syllabus-view").hidden) render();
}
function saveUnitQuietly(tracker){
  if(!tracker.units) tracker.units = {};
  tracker.units[unitDraftId] = JSON.parse(JSON.stringify(unitDraft));
}

async function pushTrackerDetails(tracker){
  try{
    const fb = await firebaseReady();
    await fb.store.updateDoc(trackerRef(fb, tracker.remote.code),
      "name", tracker.name, "year", tracker.year || "",
      "updated", new Date().toISOString());
    noteSyncOk();
  }catch(_){
    noteSyncFailure("That change");
  }
}
async function pushUnit(tracker, id, unit, tickPairs){
  if(!tracker.remote) return;
  try{
    const fb = await firebaseReady();
    const args = [new fb.store.FieldPath("units", id),
                  unit === null ? fb.store.deleteField() : unit];
    tickPairs.forEach(([kind,key,value])=>{
      args.push(new fb.store.FieldPath(kind, key),
                value === null ? fb.store.deleteField() : value);
    });
    args.push("updated", new Date().toISOString());
    await fb.store.updateDoc(trackerRef(fb, tracker.remote.code), ...args);
    noteSyncOk();
  }catch(_){
    noteSyncFailure(unit === null ? "That deletion" : "That unit");
  }
}

/* ---------- wiring ---------- */
document.getElementById("scopeout").addEventListener("click", e=>{
  const start = e.target.closest("[data-start]");
  if(start){
    const action = start.dataset.start;
    if(action === "continue"){
      const selected = document.getElementById("scopeplanselect")?.value;
      if(selected && track.store.trackers.some(plan=>plan.id===selected)){
        scopePlanChoice = selected;
        track.store.active = selected;
      }
      scopeSetup = null;
      setTracking(true, false);
      trackSave(); renderTrackerSelect(); renderScope();
      return;
    } else if(action === "guided"){
      scopeSetup = {step:"year", year:"", name:""};
    } else if(action === "self"){
      setTracking(true, false);
      openNameRow("new");
      return;
    } else if(action === "toddle"){
      const selected = document.getElementById("scopeplanselect")?.value;
      if(selected && track.store.trackers.some(plan=>plan.id===selected)){
        scopePlanChoice = selected;
        track.store.active = selected;
        setTracking(true, false);
        trackSave(); renderTrackerSelect(); renderScope();
      }
      document.getElementById("toddlefile").click();
      return;
    } else if(action === "cancel"){
      scopeSetup = null;
    } else if(action === "toname"){
      scopeSetup.step = "name";
      scopeSetup.name = scopeSetup.name || (scopeSetup.year + " — " + new Date().getFullYear());
    } else if(action === "back"){
      scopeSetup.name = document.getElementById("startname").value;
      scopeSetup.step = "year";
    } else if(action === "create"){
      createPlan(scopeSetup.year, document.getElementById("startname").value);
      return;
    }
    renderScope();
    const field = document.getElementById("startname");
    if(field){ field.focus(); field.select(); }
    return;
  }
  const deletePick = e.target.closest("[data-start-delete]");
  if(deletePick){
    const selected = document.getElementById("scopeplanselect")?.value;
    const tracker=track.store.trackers.find(plan=>plan.id===selected);
    if(tracker){
      scopePlanChoice = selected;
      openPlanRemovalConfirmation(tracker);
    }
    return;
  }
  const yearChip = e.target.closest("[data-year]");
  if(yearChip && scopeSetup){
    scopeSetup.year = yearChip.dataset.year;
    renderScope();
    return;
  }
  const open = e.target.closest("[data-unit]");
  if(open){ openUnit(open.dataset.unit); return; }
  const mobileTerm = e.target.closest("[data-scope-term]");
  if(mobileTerm){
    scopeMobileTerm = mobileTerm.dataset.scopeTerm;
    renderScope();
    return;
  }
  const add = e.target.closest("[data-add]");
  if(add){
    const [kla,term] = add.dataset.add.split("|");
    openUnit(null, {kla, term});
  }
});
document.getElementById("scopeout").addEventListener("change", e=>{
  if(e.target.id!=="scopeplanselect") return;
  scopePlanChoice = e.target.value || null;
});
document.getElementById("scopeprint").addEventListener("click", ()=>{
  document.body.classList.add("scopeprint");
  window.print();
  setTimeout(()=>document.body.classList.remove("scopeprint"), 500);
});

/* everything the planner needs now exists; draw it if we landed on #scope */
scopeReady = true;
if(!document.getElementById("scope-view").hidden) renderScope();

/* ---------- popovers ---------- */
function closeAllPops(except){
  document.querySelectorAll(".pop").forEach(pop=>{
    if(pop===except || pop.hidden) return;
    pop.hidden = true;
    const trigger = pop.parentElement.querySelector("[aria-haspopup]");
    if(trigger) trigger.setAttribute("aria-expanded","false");
  });
}
document.addEventListener("click", e=>{
  const trigger = e.target.closest("[aria-haspopup]");
  if(trigger && trigger.parentElement.classList.contains("popwrap")){
    const pop = trigger.parentElement.querySelector(".pop");
    const opening = pop.hidden;
    closeAllPops(opening ? pop : null);
    pop.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    return;
  }
  /* a menu item has just run its own handler on the way up; close behind it */
  if(e.target.closest(".popitem")){ closeAllPops(); return; }
  /* chips inside a popover stay put, so several can be chosen in one go */
  if(!e.target.closest(".pop")) closeAllPops();
});
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeAllPops(); });

/* Keep the taught-filter action's label in step with its current state. */
function updateTrackerLabels(){
  const viewBtn = document.getElementById("hidetaught");
  if(!viewBtn) return;
  viewBtn.textContent = track.view === "todo"
    ? "Show everything again" : "Hide what I\u2019ve already taught";
}
function updateFilterLabels(){
  updateTrackerLabels();
  const selected = (set,items,fallback)=>set.size
    ? [...set].map(value=>(items.find(([key])=>key===value)||[,value])[1]).join(", ")
    : fallback;
  const contentSummary = document.getElementById("contentfiltersummary");
  if(contentSummary){
    const parts = [selected(state.year,YEARS,"All years"),selected(state.kla,KLAS,"All syllabuses")];
    if(state.part.size) parts.push(selected(state.part,PARTS,""));
    contentSummary.textContent = parts.join(" · ");
  }
  const workSummary = document.getElementById("workfiltersummary");
  if(workSummary){
    const parts = [selected(workState.year,YEARS,"All years"),selected(workState.kla,KLAS,"All learning areas")];
    if(workState.format.size) parts.push([...workState.format].join(", "));
    if(workState.subject) parts.push(workState.subject);
    workSummary.textContent = parts.join(" · ");
  }
}
/* ---------- scope and sequence workbook ----------
   A minimal .xlsx writer: an xlsx is an OPC ZIP of XML parts, and ZIP permits
   stored (uncompressed) entries, so no compression library is needed. */
const CRC_TABLE = (()=>{ const t=[];
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; }
  return t; })();
function crc32(bytes){
  let c = 0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const xlBytes = str => new TextEncoder().encode(str);

function zipStore(files){
  const chunks=[], central=[];
  let offset=0;
  const u16=n=>[n&0xFF,(n>>8)&0xFF];
  const u32=n=>[n&0xFF,(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF];
  files.forEach(({name,data})=>{
    const nameBytes=xlBytes(name), crc=crc32(data), size=data.length;
    const local=[...u32(0x04034b50),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),
      ...u32(crc),...u32(size),...u32(size),...u16(nameBytes.length),...u16(0)];
    chunks.push(new Uint8Array(local), nameBytes, data);
    central.push([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),
      ...u32(crc),...u32(size),...u32(size),...u16(nameBytes.length),...u16(0),...u16(0),
      ...u16(0),...u16(0),...u32(0),...u32(offset)], nameBytes);
    offset += local.length + nameBytes.length + size;
  });
  const cdStart=offset; const cdParts=[];
  for(let i=0;i<central.length;i+=2){
    cdParts.push(new Uint8Array(central[i]), central[i+1]);
    offset += central[i].length + central[i+1].length;
  }
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),
    ...u16(files.length),...u16(files.length),...u32(offset-cdStart),...u32(cdStart),...u16(0)]);
  const all=[...chunks,...cdParts,end];
  const total=all.reduce((a,b)=>a+b.length,0);
  const out=new Uint8Array(total); let p=0;
  all.forEach(b=>{ out.set(b,p); p+=b.length; });
  return out;
}

const xlEsc = s => String(s==null?"":s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/\x1b/g,"");
function xlCol(i){ let n="",x=i; do{ n=String.fromCharCode(65+(x%26))+n; x=Math.floor(x/26)-1; }while(x>=0); return n; }
const XL_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0"/>` +
  `<xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>` +
  `<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1">` +
  `<alignment wrapText="1" vertical="top"/></xf>` +
  `<xf xfId="0" numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;
/* style ids: 0 plain, 1 bold, 2 wrapped, 3 title */
function xlSheetXml(rows, widths, styleFor){
  const cols = widths && widths.length
    ? `<cols>` + widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("") + `</cols>`
    : "";
  const body = rows.map((cells,r)=>
    `<row r="${r+1}">` + cells.map((v,c)=>{
      if(v==null||v==="") return "";
      const st = styleFor ? styleFor(r,c) : 0;
      return `<c r="${xlCol(c)}${r+1}"${st?` s="${st}"`:""} t="inlineStr">` +
        `<is><t xml:space="preserve">${xlEsc(v)}</t></is></c>`;
    }).join("") + `</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}` +
    `<sheetData>${body}</sheetData></worksheet>`;
}
function buildWorkbook(sheets){   // [{name, rows:[[cell,...]]}]
  const files=[];
  const NS="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  files.push({name:"[Content_Types].xml", data:xlBytes(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `</Types>`)});
  files.push({name:"_rels/.rels", data:xlBytes(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)});
  files.push({name:"xl/workbook.xml", data:xlBytes(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS}"><sheets>` +
    sheets.map((s,i)=>`<sheet name="${xlEsc(s.name).slice(0,31)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("") +
    `</sheets></workbook>`)});
  files.push({name:"xl/_rels/workbook.xml.rels", data:xlBytes(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="${NS}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("") +
    `<Relationship Id="rIdStyles" Type="${NS}/styles" Target="styles.xml"/>` +
    `</Relationships>`)});
  files.push({name:"xl/styles.xml", data:xlBytes(XL_STYLES)});
  sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,
    data:xlBytes(xlSheetXml(s.rows, s.widths, s.styleFor))}));
  return zipStore(files);
}

/* ---------- the sheets themselves ---------- */
/* group a unit's attached content by focus area — the shape the editor shows */
function unitContentGroups(unit){
  const groups=new Map();
  Object.keys(unit.fa||{}).forEach(key=>{
    const r=FA_BY_KEY.get(key); if(r) groups.set(key,{r,points:[]});
  });
  Object.keys(unit.pt||{}).forEach(key=>{
    const hit=PT_BY_KEY.get(key); if(!hit) return;
    if(!groups.has(hit.r._fk)) groups.set(hit.r._fk,{r:hit.r,points:[]});
    groups.get(hit.r._fk).points.push(hit.it);
  });
  groups.forEach(entry=>{
    const order=[]; entry.r.g.forEach(g=>g.i.forEach(it=>order.push(it._pk)));
    entry.points.sort((a,b)=>order.indexOf(a._pk)-order.indexOf(b._pk));
  });
  return [...groups.values()].sort((a,b)=>
    (KLA_ORDER.get(a.r.k) ?? 99)-(KLA_ORDER.get(b.r.k) ?? 99) || a.r._i-b.r._i);
}

function scopeWorkbookSheets(){
  const plan = activeTracker();
  const units = Object.entries(unitsOf(plan));
  const when = new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  const byWeek = (a,b)=>(a[1].wkFrom||99)-(b[1].wkFrom||99) || a[1].name.localeCompare(b[1].name);
  const NL = String.fromCharCode(10);

  const overview = [
    [plan.name],
    [(plan.year || "All year groups") + " · scope and sequence · generated " + when],
    [],
    ["Syllabus"].concat(TRACK_TERMS.map(([,label])=>label))
  ];
  KLAS.forEach(([k,label])=>{
    overview.push([label].concat(TRACK_TERMS.map(([term])=>
      units.filter(([,u])=>u.term===term && u.klas && u.klas[k]).sort(byWeek)
        .map(([,u])=>{ const w=unitWeeks(u); return u.name + (w?" ("+w+")":"") + (u.taught?" ✓":""); })
        .join(NL))));
  });

  const termSheets = TRACK_TERMS.map(([term,label])=>{
    const rows=[["Unit","Weeks","Syllabus","Stage","Outcomes","Focus area","Content point","Taught"]];
    units.filter(([,u])=>u.term===term).sort(byWeek).forEach(([,u])=>{
      const weeks = unitWeeks(u).replace("Wk ","");
      const groups = unitContentGroups(u);
      if(!groups.length){
        rows.push([u.name, weeks, "", "", "", "", "No syllabus content attached yet", u.taught||""]);
        return;
      }
      groups.forEach(entry=>{
        const codes = entry.r.o.filter(o=>o.c).map(o=>o.c).join(", ");
        if(!entry.points.length){
          rows.push([u.name, weeks, entry.r.kla, entry.r.sh, codes, entry.r.t, "", u.taught||""]);
          return;
        }
        entry.points.forEach(it=>
          rows.push([u.name, weeks, entry.r.kla, entry.r.sh, codes, entry.r.t, it.t, u.taught||""]));
      });
    });
    if(rows.length===1) rows.push(["No units planned for this term"]);
    return {name:label, widths:[26,9,16,7,24,30,64,8],
            styleFor:(r,c)=> r===0 ? 1 : c===6 ? 2 : 0, rows};
  });

  return [{name:"Year overview", widths:[18,30,30,30,30],
           styleFor:(r,c)=> r===0 ? 3 : r===3 ? 1 : r>3 ? 2 : 0, rows:overview}]
         .concat(termSheets);
}

function exportScopeWorkbook(){
  const plan = activeTracker();
  if(!plan){ toast("Create a plan first"); return; }
  if(!Object.keys(unitsOf(plan)).length){ toast("Add some units to the plan first"); return; }
  const blob = new Blob([buildWorkbook(scopeWorkbookSheets())],
    {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (plan.name.replace(/[^\w\s-]+/g,"").trim().replace(/\s+/g,"-").toLowerCase()
                || "plan") + "-scope-and-sequence.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast("Scope and sequence downloaded");
}
document.getElementById("trkxlsx").addEventListener("click", exportScopeWorkbook);

/* ---------- reading a Toddle .xlsx ---------- */
/* Toddle's parts are DEFLATE compressed and its cells use a shared string table,
   so this is not the writer in reverse. DecompressionStream does the inflating,
   which keeps the page free of a zip library. */
async function inflateRaw(bytes){
  if(typeof DecompressionStream !== "function") throw new Error("no-decompression");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function readZipEntries(buffer){
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let eocd = -1;
  for(let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--){
    if(view.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error("not-a-zip");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = {};
  for(let n = 0; n < count; n++){
    if(view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const csize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localAt = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    files[name] = {method, data: bytes.subarray(start, start + csize)};
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
async function zipText(files, name){
  const entry = files[name];
  if(!entry) return null;
  const raw = entry.method === 0 ? entry.data : await inflateRaw(entry.data);
  return new TextDecoder().decode(raw);
}
const xlColIndex = letters =>
  [...letters].reduce((n,ch)=>n*26 + (ch.charCodeAt(0)-64), 0) - 1;

function parseSheetXml(xml, shared){
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("row")].map(row=>{
    const cells = [];
    [...row.getElementsByTagName("c")].forEach(c=>{
      const col = xlColIndex((c.getAttribute("r")||"A").replace(/[^A-Z]/g,"")) ;
      const type = c.getAttribute("t");
      let value = "";
      if(type === "inlineStr"){
        value = [...c.getElementsByTagName("t")].map(t=>t.textContent).join("");
      } else {
        const v = c.getElementsByTagName("v")[0];
        if(v) value = type === "s" ? (shared[+v.textContent] || "") : v.textContent;
      }
      if(col >= 0) cells[col] = value;
    });
    return cells;
  });
}
async function readWorkbook(buffer){
  const files = readZipEntries(buffer);
  const wbXml = await zipText(files, "xl/workbook.xml");
  if(!wbXml) throw new Error("not-xlsx");
  const rels = new DOMParser().parseFromString(
    await zipText(files, "xl/_rels/workbook.xml.rels") || "<x/>", "application/xml");
  const relMap = {};
  [...rels.getElementsByTagName("Relationship")].forEach(r=>
    relMap[r.getAttribute("Id")] = r.getAttribute("Target"));
  const ssXml = await zipText(files, "xl/sharedStrings.xml");
  const shared = [];
  if(ssXml){
    const sd = new DOMParser().parseFromString(ssXml, "application/xml");
    [...sd.getElementsByTagName("si")].forEach(si=>
      shared.push([...si.getElementsByTagName("t")].map(t=>t.textContent).join("")));
  }
  const doc = new DOMParser().parseFromString(wbXml, "application/xml");
  const sheets = [];
  for(const el of [...doc.getElementsByTagName("sheet")]){
    const rid = el.getAttribute("r:id") || el.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
    let target = relMap[rid] || "";
    if(target && !target.startsWith("xl/")) target = "xl/" + target.replace(/^\/?/,"");
    const xml = await zipText(files, target);
    sheets.push({name: el.getAttribute("name") || "", rows: xml ? parseSheetXml(xml, shared) : []});
  }
  return sheets;
}

/* ---------- turning that into units ---------- */
const FA_BY_TITLE = new Map();
const YEAR_TO_STAGE = {};
DATA.forEach(r=>{
  if(!FA_BY_TITLE.has(r.t)) FA_BY_TITLE.set(r.t, []);
  FA_BY_TITLE.get(r.t).push(r);
  (r._years||[]).forEach(y=>{ YEAR_TO_STAGE[y] = r.sh; });
});
/* Titles are written by hand in Toddle, so order and punctuation vary. Pull the
   year, terms and weeks out by pattern, then treat whatever survives as the name. */
const YEAR_IN_TITLE = /\b(Kindergarten|Kindergartern|Year\s*[1-6](?:\s*&\s*[1-6])?)\b/i;
const TERM_RANGE = /\bT(?:erm)?\s*([1-4])\s*(?:[-–&]|\bto\b)\s*(?:T(?:erm)?\s*)?([1-4])\b/i;
const TERM_ONE = /\bT(?:erm)?\s*([1-4])\b/ig;
const WEEK_RANGE = /\bWk\s*(\d+)\s*[-–]\s*(?:Term\s*\d\s*)?(?:Wk\s*)?(\d+)/i;
const WEEK_ONE = /\bWk\s*(\d+)/i;
const STRIP = [YEAR_IN_TITLE, TERM_RANGE, /\bT(?:erm)?\s*[1-4]\b/ig, WEEK_RANGE, WEEK_ONE,
               /\bSem(?:ester)?\s*\d\b/ig, /^\s*\d{4}\s*$/];

function readToddleUnit(title, standards, stage){
  const yearMatch = title.match(YEAR_IN_TITLE);
  const year = yearMatch ? yearMatch[0].replace(/kindergartern/i,"Kindergarten")
    .replace(/\s+/g," ").replace(/^year/i,"Year").trim() : "";

  const range = title.match(TERM_RANGE);
  let terms = [];
  if(range){
    const from = Math.min(+range[1], +range[2]), to = Math.max(+range[1], +range[2]);
    for(let t=from; t<=to; t++) terms.push("T"+t);
  } else {
    terms = [...new Set([...title.matchAll(TERM_ONE)].map(m=>"T"+m[1]))];
  }

  const weeks = title.match(WEEK_RANGE) || title.match(WEEK_ONE);

  const name = title.split("|").map(part=>{
      let x = part;
      STRIP.forEach(re=>{ x = x.replace(re, " "); });
      /* trim stray separators at the edges only — a name may legitimately
         contain a hyphen or an ampersand, as in Well-Being or Identity & Belonging */
      return x.replace(/\s{2,}/g," ").replace(/^[\s\-–&|,]+|[\s\-–&|,]+$/g,"").trim();
    }).filter(Boolean).join(" — ").trim();

  const fa={}, klas={}, syllabuses={};
  String(standards||"").split("\n").forEach(raw=>{
    const line = raw.replace(/^[\s•]+/,"").trim();
    if(!line) return;
    (FA_BY_TITLE.get(line)||[]).forEach(r=>{
      if(r.sh !== stage) return;
      fa[r._fk]=true; klas[r.k]=true;
      syllabuses[r.kla]=(syllabuses[r.kla]||0)+1;
    });
  });
  const stamped = (title.match(/^\s*(\d{4})/)||[])[1];
  return {title, name: name || title, year, terms,
          spansTerms: terms.length > 1, fa, klas, syllabuses,
          wkFrom: weeks ? Number(weeks[1]) : "",
          wkTo: weeks && weeks[2] ? Number(weeks[2]) : "",
          stale: !!stamped && stamped !== String(new Date().getFullYear()),
          count: Object.keys(fa).length};
}
function parseToddleWorkbook(sheets, stage){
  const seen = new Set(), units = [];
  sheets.forEach(sheet=>sheet.rows.forEach(row=>{
    const title = String(row[0]||"").trim();
    if(!title || !title.includes("|") || seen.has(title)) return;
    seen.add(title);
    units.push(readToddleUnit(title, row[3]||"", stage));
  }));
  return units;
}

/* ---------- the Toddle import review ---------- */
let toddleReview = null;

function toddleBucket(u, plan, stage){
  if(u.stale) return "stale";
  if(!u.year) return "noyear";
  if(u.year !== (plan.year || u.year)) return "otheryear";
  if(Object.values(unitsOf(plan)).some(x=>x.name === u.name)) return "already";
  if(!u.count) return "nocontent";
  return u.terms.length === 1 ? "ready" : "needsterm";
}
const TODDLE_GROUPS = [
  ["ready",     "Ready to import",        true],
  ["needsterm", "Choose a term",          true],
  ["nocontent", "No syllabus content matched", false],
  ["already",   "Already in your plan",   false],
  ["otheryear", "A different year group", false],
  ["noyear",    "No year group in Toddle", false],
  ["stale",     "From a previous year",   false]
];

/* the year named most often in the file is the year the file is about */
function dominantYear(sheets){
  const tally = {};
  sheets.forEach(sh=>sh.rows.forEach(row=>{
    const m = String(row[0]||"").match(YEAR_IN_TITLE);
    if(!m) return;
    const y = m[0].replace(/kindergartern/i,"Kindergarten").replace(/\s+/g," ")
      .replace(/^year/i,"Year").trim();
    if(YEAR_TO_STAGE[y]) tally[y] = (tally[y]||0) + 1;
  }));
  return Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
}
async function handleToddleFile(file){
  if(typeof DecompressionStream !== "function"){
    toast("This browser is too old to read .xlsx — try Chrome, Edge or Safari 17");
    return;
  }
  toast("Reading " + file.name + "…");
  let sheets;
  try{ sheets = await readWorkbook(await file.arrayBuffer()); }
  catch(_){ toast("That file is not a readable .xlsx"); return; }

  let plan = activeTracker();
  if(!plan){
    const found = dominantYear(sheets);
    if(!found){ toast("No year group found in that file — create a plan first"); return; }
    plan = makeTracker(found[0] + " — " + new Date().getFullYear());
    plan.year = found[0];
    setTracking(true, false);
    applyTrackerYear(); trackSave(); renderTrackerSelect();
  }
  const stage = YEAR_TO_STAGE[plan.year] || "";
  const units = parseToddleWorkbook(sheets, stage);
  if(!units.length){
    const looksLikeStandards = sheets.some(sh=>
      (sh.rows[0]||[]).some(c=>String(c).toLowerCase().includes("standard code")));
    toast(looksLikeStandards
      ? "That is the Standards export — use Unit_view.xlsx instead"
      : "No units found in that file");
    return;
  }
  toddleReview = {file:file.name, plan, stage, units,
    choice: units.map(u=>({include:false, term:u.terms[0] || ""}))};
  units.forEach((u,i)=>{
    u._bucket = toddleBucket(u, plan, stage);
    toddleReview.choice[i].include = (u._bucket === "ready" || u._bucket === "needsterm");
  });
  openToddleReview();
}

function openToddleReview(){
  showSheet("toddle",toddleReviewHTML(),"#toddleclose");
}
function closeToddleReview(){
  toddleReview = null;
  hideSheet();
}
function toddleSelectedCount(){
  return toddleReview.choice.filter((c,i)=>
    c.include && (toddleReview.units[i].count === 0 || c.term)).length;
}
function toddleReviewHTML(){
  const {units, choice, plan, file} = toddleReview;
  const counts = {};
  units.forEach(u=>counts[u._bucket] = (counts[u._bucket]||0)+1);
  const n = toddleSelectedCount();
  let h = `<div class="sheethead">
    <div>
      <h2 id="sheettitle">Import from Toddle</h2>
      <div class="sheetmeta">${esc(file)} &middot; ${units.length} units found &middot;
        into ${esc(plan.name)}${plan.year?" ("+esc(plan.year)+")":""}</div>
    </div>
    <div class="sheetacts">
      <button class="sheetbtn primary" id="toddlego" type="button" ${n?"":"disabled"}>
        Import ${n} unit${n===1?"":"s"}</button>
      <button class="sheetbtn" id="toddleclose" type="button">Cancel</button>
    </div>
  </div>`;
  TODDLE_GROUPS.forEach(([key,label,openByDefault])=>{
    const idx = units.map((u,i)=>i).filter(i=>units[i]._bucket===key);
    if(!idx.length) return;
    h += `<details class="tdgroup"${openByDefault?" open":""}>
      <summary><b>${esc(label)}</b> <span class="tdcount">${idx.length}</span></summary>`;
    idx.forEach(i=>{
      const u = units[i], c = choice[i];
      const syl = Object.entries(u.syllabuses)
        .map(([k,v])=>`${esc(k)} ${v}`).join(" &middot; ") || "no syllabus content";
      const weeks = u.wkFrom ? `Wk ${u.wkFrom}${u.wkTo?"–"+u.wkTo:""}` : "";
      h += `<div class="tdrow${c.include?" on":""}">
        <button class="tick tdtick" type="button" role="checkbox" aria-checked="${c.include}"
          data-td="${i}" aria-label="Include this unit">&#10003;</button>
        <div class="tdmain">
          <div class="tdname">${esc(u.name)}</div>
          <div class="tdmeta">${weeks?esc(weeks)+" &middot; ":""}${syl}` +
          (u.year && key!=="otheryear" ? "" : u.year ? ` &middot; ${esc(u.year)}` : "") +
          `</div>` +
          (key==="needsterm" || u.spansTerms
            ? `<div class="tdterms">` + TRACK_TERMS.map(([v,l])=>
                `<button class="chip tdterm" type="button" data-tdterm="${i}:${v}"
                   aria-pressed="${c.term===v}">${esc(l)}</button>`).join("") +
              (u.spansTerms?`<span class="tdhint">Toddle spans ${u.terms.join(" and ")} — pick one</span>`:"") +
              `</div>`
            : "") +
        `</div>
      </div>`;
    });
    h += `</details>`;
  });
  h += `<p class="sumnote">Nothing is created until you choose Import. Units with no content
    can still be imported and filled in later.</p>`;
  return h;
}
function refreshToddleReview(){
  const scroll = document.getElementById("sheet").scrollTop;
  const open = [...document.querySelectorAll("#sheet .tdgroup")].map(d=>d.open);
  document.getElementById("sheet").innerHTML = toddleReviewHTML();
  [...document.querySelectorAll("#sheet .tdgroup")].forEach((d,i)=>{ if(open[i]!==undefined) d.open=open[i]; });
  document.getElementById("sheet").scrollTop = scroll;
}
function commitToddleImport(){
  const {units, choice, plan} = toddleReview;
  if(!plan.units) plan.units = {};
  let made = 0;
  units.forEach((u,i)=>{
    const c = choice[i];
    if(!c.include) return;
    if(u.count && !c.term) return;
    const id = fnv1a("u|" + u.name + "|" + (c.term||"T1") + "|" + Date.now() + "|" + i);
    /* a range like "Wk 8 - Term 2 Wk 3" crosses a term boundary, so once the unit
       is pinned to one term only the start week still means anything */
    const crossesTerms = u.wkTo && u.wkFrom && u.wkTo < u.wkFrom;
    plan.units[id] = {name:u.name, term:c.term || "T1",
      wkFrom:u.wkFrom || "", wkTo:crossesTerms ? "" : (u.wkTo || ""),
      klas:{...u.klas}, fa:{...u.fa}, pt:{}, taught:null};
    if(!Object.keys(plan.units[id].klas).length) plan.units[id].klas = {en:true};
    pushUnit(plan, id, plan.units[id], []);
    made++;
  });
  trackSave();
  closeToddleReview();
  setView("scope"); renderScope();
  toast(`Imported ${made} unit${made===1?"":"s"} from Toddle`);
}

document.getElementById("trktoddle").addEventListener("click", ()=>
  document.getElementById("toddlefile").click());
document.getElementById("toddlefile").addEventListener("change", e=>{
  if(e.target.files && e.target.files[0]) handleToddleFile(e.target.files[0]);
  e.target.value = "";
});
document.getElementById("sheet").addEventListener("click", e=>{
  if(!toddleReview) return;
  const tick = e.target.closest("[data-td]");
  if(tick){
    const i = +tick.dataset.td;
    toddleReview.choice[i].include = !toddleReview.choice[i].include;
    refreshToddleReview();
    return;
  }
  const term = e.target.closest("[data-tdterm]");
  if(term){
    const [i,v] = term.dataset.tdterm.split(":");
    toddleReview.choice[+i].term = v;
    toddleReview.choice[+i].include = true;
    refreshToddleReview();
    return;
  }
  if(e.target.closest("#toddlego")) commitToddleImport();
  if(e.target.closest("#toddleclose")) closeToddleReview();
});

render();
renderWork();
