import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFitnessSummary } from '../running-app/fitness-summary.js';

test('fitness summary prioritizes the existing race readiness score', () => {
  const summary = buildFitnessSummary({
    kpi: { race_readiness_pct: 78, avg_readiness_14d: 72, avg_compliance_28d: 80, plan_adherence_pct: 75, last7_km: 22.5, last28_km: 81 },
    load: { injury_risk: 'low', comment: 'balanced' },
    recent_activities: [{ distance_km: 6.32 }]
  });
  assert.equal(summary.score, 78);
  assert.equal(summary.label, 'ฟิตดี');
  assert.equal(summary.last7Km, 22.5);
  assert.equal(summary.risk, 'ความเสี่ยงต่ำ');
});

test('fitness summary derives a score when race readiness is absent', () => {
  const summary = buildFitnessSummary({
    kpi: { avg_readiness_14d: 60, avg_compliance_28d: 80, plan_adherence_pct: 70, last7_km: 12 }
  });
  assert.equal(summary.score, 69);
  assert.equal(summary.label, 'ฟิตปานกลาง');
});

test('fitness summary uses the current workout as the next action', () => {
  const summary = buildFitnessSummary({ kpi: { race_readiness_pct: 75 } }, {
    workout: { title: 'Easy Run', main_set: 'วิ่งเบา', planned_distance_km: 6, target_rpe: 4 }
  });
  assert.equal(summary.action.title, 'Easy Run');
  assert.match(summary.action.message, /6 กม./);
});

test('empty data state does not invent a fitness level', () => {
  const summary = buildFitnessSummary();
  assert.equal(summary.hasData, false);
  assert.equal(summary.score, 0);
  assert.equal(summary.label, 'รอข้อมูลการวิ่ง');
});
