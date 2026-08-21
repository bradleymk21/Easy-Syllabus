export function syllabusSearchText(record){
  return (record.o.map(outcome=>outcome.c+" "+outcome.d).join(" ")+" "+
    record.g.map(group=>group.i.map(point=>point.t).join(" ")).join(" ")).toLowerCase();
}

export function defaultMathsPart(year, stageYears){
  const years = Object.values(stageYears).find(stage=>stage.includes(year)) || [];
  if(years.length < 2) return "";
  return years.indexOf(year) === 0 ? "A" : "B";
}

export function buildPlanScope(data, plan, stageYears){
  const year = plan?.year || "";
  const mathsPart = defaultMathsPart(year, stageYears);
  return data.filter(record=>{
    const years = record._years || stageYears[record.st] || [];
    if(year && !years.includes(year)) return false;
    const part = record._part ?? (record.k === "ma" ? (record.t.match(/ ([AB])$/)?.[1] || "") : "");
    return !(record.k === "ma" && mathsPart && part && part !== mathsPart);
  });
}

export function calculateCoverage(scope, plan, pointToFocus=new Map()){
  const units = Object.values(plan?.units || {});
  const rows = scope.map(record=>{
    const plannedTerms = new Set();
    units.forEach(unit=>{
      const directlyPlanned = !!unit.fa?.[record._fk];
      const plannedByPoint = Object.keys(unit.pt || {}).some(key=>pointToFocus.get(key) === record._fk);
      if(directlyPlanned || plannedByPoint) plannedTerms.add(unit.term || "T1");
    });

    const taughtTerms = new Set();
    if(plan?.fa?.[record._fk]?.t) taughtTerms.add(plan.fa[record._fk].t);
    record.g.forEach(group=>group.i.forEach(point=>{
      const tick = plan?.pt?.[point._pk];
      if(tick?.t) taughtTerms.add(tick.t);
    }));

    const planned = plannedTerms.size > 0;
    const taught = taughtTerms.size > 0;
    const status = planned && taught ? "planned-taught" :
      planned ? "planned-only" : taught ? "taught-only" : "unplanned";
    return {record, planned, taught, status,
            plannedTerms:[...plannedTerms], taughtTerms:[...taughtTerms]};
  });

  return {
    rows,
    total:rows.length,
    planned:rows.filter(row=>row.planned).length,
    taught:rows.filter(row=>row.taught).length,
    plannedTaught:rows.filter(row=>row.status === "planned-taught").length,
    plannedOnly:rows.filter(row=>row.status === "planned-only").length,
    taughtOnly:rows.filter(row=>row.status === "taught-only").length,
    unplanned:rows.filter(row=>row.status === "unplanned").length
  };
}

const clone = value => JSON.parse(JSON.stringify(value));

export function duplicateUnit(unit){
  const copy = clone(unit);
  copy.name = `${unit.name || "Untitled unit"} — copy`;
  copy.taught = null;
  delete copy.added;
  return copy;
}

export function advanceCalendarYearInName(name, fallbackYear=new Date().getFullYear()+1){
  const matches = [...String(name || "").matchAll(/\b(20\d{2})\b/g)];
  if(matches.length){
    const match = matches[matches.length-1];
    const next = String(+match[1] + 1);
    return name.slice(0,match.index) + next + name.slice(match.index + match[1].length);
  }
  return `${name || "My plan"} — ${fallbackYear}`;
}

export function setCalendarYearInName(name,year){
  const cleanYear=String(year || "").trim();
  if(!/^20\d{2}$/.test(cleanYear)) return String(name || "").trim();
  const matches=[...String(name || "").matchAll(/\b20\d{2}\b/g)];
  if(!matches.length) return `${String(name || "My plan").trim() || "My plan"} — ${cleanYear}`;
  const match=matches[matches.length-1];
  return name.slice(0,match.index)+cleanYear+name.slice(match.index+match[0].length);
}

export function copyPlan(source, {id, name, includeProgress=false, now=new Date().toISOString()}){
  const units = {};
  Object.entries(source.units || {}).forEach(([key,unit])=>{
    const next = clone(unit);
    if(!includeProgress){
      next.taught = null;
      delete next.added;
    }
    units[key] = next;
  });
  return {
    id,
    name,
    year:source.year || "",
    created:now,
    updated:now,
    fa:includeProgress ? clone(source.fa || {}) : {},
    pt:includeProgress ? clone(source.pt || {}) : {},
    units
  };
}
