function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(number(value))));
}

function weightedScore(values) {
  const available = values.filter(item => number(item.value) > 0 && number(item.weight) > 0);
  if (!available.length) return 0;
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return clamp(available.reduce((sum, item) => sum + number(item.value) * item.weight, 0) / totalWeight);
}

function riskLabel(value) {
  const risk = String(value || '').toLowerCase();
  if (['low', 'safe', 'normal'].some(word => risk.includes(word))) return 'ความเสี่ยงต่ำ';
  if (['high', 'danger', 'critical'].some(word => risk.includes(word))) return 'ควรพักและติดตามอาการ';
  if (['medium', 'moderate', 'watch'].some(word => risk.includes(word))) return 'ควรคุมความหนัก';
  return value ? String(value) : 'ยังไม่มีข้อมูล';
}

function fitnessBand(score, hasData) {
  if (!hasData) return { label: 'รอข้อมูลการวิ่ง', short: 'อัปโหลดภาพแรกเพื่อเริ่มวัดความฟิต', tone: 'muted' };
  if (score >= 85) return { label: 'ฟิตดีมาก', short: 'ร่างกายและความสม่ำเสมออยู่ในระดับพร้อมมาก', tone: 'excellent' };
  if (score >= 70) return { label: 'ฟิตดี', short: 'ฐานความฟิตกำลังไปได้ดี รักษาความต่อเนื่องไว้', tone: 'good' };
  if (score >= 55) return { label: 'ฟิตปานกลาง', short: 'กำลังสร้างฐานได้ แต่ยังมีพื้นที่ให้พัฒนา', tone: 'steady' };
  if (score >= 40) return { label: 'ควรฟื้นตัว', short: 'ลดความหนักชั่วคราวและให้ความสำคัญกับการพัก', tone: 'recover' };
  return { label: 'ข้อมูลฟิตยังต่ำ', short: 'เริ่มจากงานเบาและสะสมความสม่ำเสมอทีละน้อย', tone: 'low' };
}

function nextAction(today, dashboard, score) {
  const recommendation = today?.recommendation || {};
  const workout = today?.workout || {};
  const load = dashboard?.load || {};
  if (recommendation.message) return { title: recommendation.title || 'คำแนะนำวันนี้', message: recommendation.message };
  if (String(load.injury_risk || '').toLowerCase().includes('high')) {
    return { title: 'วันนี้ควรฟื้นตัว', message: load.comment || 'ลดความหนัก พัก และติดตามอาการก่อนซ้อมครั้งถัดไป' };
  }
  if (workout.title) {
    const details = [workout.main_set, workout.planned_distance_km ? `${workout.planned_distance_km} กม.` : '', workout.target_rpe ? `RPE ${workout.target_rpe}` : ''].filter(Boolean);
    return { title: workout.title, message: details.join(' · ') || workout.purpose || 'ทำตามแผนวันนี้โดยคุมความหนักให้สม่ำเสมอ' };
  }
  return score >= 70
    ? { title: 'รักษาความต่อเนื่อง', message: 'วันนี้เลือก Easy Run เบา ๆ หรือพักตามความรู้สึก เพื่อรักษาฐานความฟิต' }
    : { title: 'เริ่มจากการฟื้นตัว', message: 'เดินหรือวิ่งเบา ๆ และพักให้พอ ก่อนเพิ่มระยะหรือความหนัก' };
}

export function buildFitnessSummary(dashboard = {}, today = {}) {
  const kpi = dashboard.kpi || {};
  const load = dashboard.load || {};
  const readinessToday = number(today.readiness?.readiness_score);
  const directScore = number(kpi.race_readiness_pct);
  const derivedScore = weightedScore([
    { value: readinessToday || kpi.avg_readiness_14d, weight: 0.4 },
    { value: kpi.avg_compliance_28d, weight: 0.3 },
    { value: kpi.plan_adherence_pct, weight: 0.3 }
  ]);
  const score = clamp(directScore || derivedScore);
  const hasData = Boolean(directScore || derivedScore || number(kpi.last7_km) || dashboard.recent_activities?.length);
  const band = fitnessBand(score, hasData);
  const recent = dashboard.recent_activities?.[0] || null;

  return {
    score,
    hasData,
    label: band.label,
    short: band.short,
    tone: band.tone,
    readiness: clamp(readinessToday || kpi.avg_readiness_14d),
    last7Km: number(kpi.last7_km),
    last28Km: number(kpi.last28_km),
    consistency: clamp(kpi.avg_compliance_28d || kpi.plan_adherence_pct),
    risk: riskLabel(load.injury_risk),
    loadComment: load.comment || 'ระบบจะประเมินเมื่อมีข้อมูลการวิ่งต่อเนื่อง',
    action: nextAction(today, dashboard, score),
    recent
  };
}
