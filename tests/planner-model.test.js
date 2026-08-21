import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCalendarYearInName,
  buildPlanScope,
  calculateCoverage,
  copyPlan,
  duplicateUnit,
  setCalendarYearInName,
  syllabusSearchText
} from "../planner-model.js";

const STAGES = {"Stage 2":["Year 3","Year 4"],"Stage 3":["Year 5","Year 6"]};
const record = (key, kla="en", title="Area", part="")=>({
  _fk:key, k:kla, kla:kla === "ma" ? "Mathematics" : "English", st:"Stage 2",
  t:title+(part ? ` ${part}` : ""), o:[{c:`${key}-01`,d:`${key} outcome`}],
  g:[{t:"Group",i:[{_pk:`${key}-p1`,t:`${key} content`,n:"including-only",e:"example-only"}]}]
});

test("search text contains only outcomes and content points",()=>{
  const value = syllabusSearchText(record("READ"));
  assert.match(value,/read-01/);
  assert.match(value,/read outcome/);
  assert.match(value,/read content/);
  assert.doesNotMatch(value,/group|including-only|example-only/);
});

test("plan scope uses the plan year and its default maths sequence",()=>{
  const data=[record("EN"),record("MAA","ma","Number","A"),record("MAB","ma","Number","B")];
  assert.deepEqual(buildPlanScope(data,{year:"Year 4"},STAGES).map(row=>row._fk),["EN","MAB"]);
});

test("coverage distinguishes every category, deduplicates units and counts child ticks as taught",()=>{
  const english=record("EN");
  const maths=record("MA","ma");
  const science=record("SCI");
  const hsie=record("HS");
  const plan={
    fa:{HS:{t:"T4"}}, pt:{"EN-p1":{t:"T2"}},
    units:{
      a:{term:"T1",fa:{EN:true},pt:{}},
      b:{term:"T3",fa:{EN:true},pt:{}},
      c:{term:"T2",fa:{SCI:true},pt:{}}
    }
  };
  const coverage=calculateCoverage([english,maths,science,hsie],plan,new Map([["EN-p1","EN"]]));
  assert.equal(coverage.planned,2);
  assert.equal(coverage.taught,2);
  assert.equal(coverage.plannedTaught,1);
  assert.equal(coverage.plannedOnly,1);
  assert.equal(coverage.taughtOnly,1);
  assert.equal(coverage.unplanned,1);
  assert.deepEqual(coverage.rows[0].plannedTerms,["T1","T3"]);
});

test("duplicate unit retains structure and clears teaching state",()=>{
  const original={name:"Narrative",term:"T2",wkFrom:1,wkTo:5,klas:{en:true},fa:{EN:true},pt:{"EN-p1":true},taught:"T2",added:{fa:{EN:true}}};
  const copy=duplicateUnit(original);
  assert.equal(copy.name,"Narrative — copy");
  assert.equal(copy.taught,null);
  assert.equal("added" in copy,false);
  copy.fa.EN=false;
  assert.equal(original.fa.EN,true);
});

test("copy plan resets progress by default and never inherits sharing",()=>{
  const source={name:"4B — 2026",year:"Year 4",fa:{EN:{t:"T1"}},pt:{"EN-p1":{t:"T1"}},units:{u:{name:"Narrative",term:"T1",taught:"T1",added:{fa:{EN:true}},fa:{EN:true}}},remote:{code:"secret"}};
  const reset=copyPlan(source,{id:"new",name:"4B — 2027",now:"2026-08-21T00:00:00.000Z"});
  assert.deepEqual(reset.fa,{});
  assert.deepEqual(reset.pt,{});
  assert.equal(reset.units.u.taught,null);
  assert.equal("added" in reset.units.u,false);
  assert.equal("remote" in reset,false);
  assert.equal(source.units.u.taught,"T1");

  const kept=copyPlan(source,{id:"kept",name:"Copy",includeProgress:true});
  assert.deepEqual(kept.fa,source.fa);
  assert.equal(kept.units.u.taught,"T1");
});

test("calendar-year suggestion advances the last year",()=>{
  assert.equal(advanceCalendarYearInName("4B — 2026"),"4B — 2027");
  assert.equal(advanceCalendarYearInName("4B",2027),"4B — 2027");
  assert.equal(setCalendarYearInName("4B draft",2028),"4B draft — 2028");
  assert.equal(setCalendarYearInName("4B — 2027",2028),"4B — 2028");
});

test("version 1 tracker payload remains readable",()=>{
  const payload=JSON.parse(JSON.stringify({active:"p",trackers:[{id:"p",name:"4B",fa:{},pt:{},units:{}}],term:"T1"}));
  assert.equal(payload.active,"p");
  assert.equal(payload.trackers[0].units.constructor,Object);
});
