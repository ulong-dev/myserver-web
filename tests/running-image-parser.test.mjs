import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeWorkout,
  formatDuration,
  formatPace,
  parseWorkoutScreens
} from '../running-app/workout-image-parser.js';

const sampleScreens = [
  `Mon, 27 Jul\nOutdoor Run\nWorkout Time 0:47:26\nElapsed Time 0:48:05\nDistance 6.32KM\nActive Kilocalories 325KCAL\nTotal Kilocalories 370KCAL\nElevation Gain 1M\nAvg. Power 136W\nAvg. Cadence 164SPM\nAvg. Pace 7'30"/KM\nAvg. Heart Rate 136BPM\nEffort 4 Moderate`,
  `Heart Rate\nAvg. Heart Rate 136BPM\nZone 1 37:18 <139BPM\nZone 2 09:14 140-147BPM\nZone 3 00:00\nZone 4 00:00\nZone 5 00:00\nPost-Workout Heart Rate\n131BPM\n107BPM\n102BPM`,
  `Splits\n1 Kilometer\n1 7'48"/KM 128BPM 132W 165SPM\n2 7'31"/KM 136BPM 138W 166SPM\n3 7'23"/KM 138BPM 137W 166SPM\n4 7'30"/KM 135BPM 134W 163SPM\n5 7'27"/KM 138BPM 138W 167SPM\n6 7'16"/KM 140BPM 138W 166SPM\n7 7'25"/KM 142BPM 140W 164SPM`,
  `Workout Details\nVertical Oscillation\nAverage: 8.6CM\nGround Contact Time\nAverage: 254MS\nStride Length\nAverage: 0.8M`
];

test('Apple Fitness screenshots are combined into one workout', () => {
  const parsed = parseWorkoutScreens(sampleScreens, { fallbackDate: '2026-07-27' });
  assert.equal(parsed.date, '2026-07-27');
  assert.equal(parsed.duration_sec, 2846);
  assert.equal(parsed.elapsed_sec, 2885);
  assert.equal(parsed.distance_km, 6.32);
  assert.equal(parsed.avg_pace_sec, 450);
  assert.equal(parsed.avg_hr, 136);
  assert.equal(parsed.avg_power, 136);
  assert.equal(parsed.cadence, 164);
  assert.equal(parsed.rpe, 4);
  assert.equal(parsed.vertical_osc_cm, 8.6);
  assert.equal(parsed.gct_ms, 254);
  assert.equal(parsed.stride_len_m, 0.8);
  assert.equal(parsed.zones.length, 5);
  assert.equal(parsed.splits.length, 7);
  assert.deepEqual(parsed.recovery, { finish_bpm: 131, one_min_bpm: 107, two_min_bpm: 102 });
  assert.equal(parsed.confidence, 100);
});

test('workout analysis summarizes zones, split drift and recovery', () => {
  const parsed = parseWorkoutScreens(sampleScreens, { fallbackDate: '2026-07-27' });
  const analysis = analyzeWorkout(parsed, { planned_distance_km: 6, planned_duration_min: 45 });
  assert.equal(analysis.warnings.length, 0);
  assert.match(analysis.note, /Zone 1–2 100%/);
  assert.match(analysis.note, /\+14 bpm/);
  assert.match(analysis.note, /24 bpm ใน 1 นาที/);
  assert.equal(formatPace(450), '7:30/km');
  assert.equal(formatDuration(2846), '47:26');
});

test('pace and duration can fill each other when OCR misses one value', () => {
  const parsed = parseWorkoutScreens('Distance 5.00KM\nAvg. Pace 6:00/KM', { fallbackDate: '2026-07-27' });
  assert.equal(parsed.duration_sec, 1800);
  assert.equal(parsed.avg_pace_sec, 360);
  assert.ok(parsed.missing.includes('หัวใจเฉลี่ย'));
});

test('summary metrics survive Apple two-column OCR reading order', () => {
  const twoColumnOcr = `Mon, 27 Jul\nOutdoor Run\nWorkout Time Elapsed Time\n0:47:26 0:48:05\nDistance Active Kilocalories\n6.32KM 325KCAL\nAvg. Power Avg. Cardance\n136W 164SPM\nAvg. Pace Avg. Heart Rate\n7'30"/KM 1368PM`;
  const parsed = parseWorkoutScreens(twoColumnOcr, { fallbackDate: '2026-07-27' });
  assert.equal(parsed.avg_power, 136);
  assert.equal(parsed.cadence, 164);
  assert.equal(parsed.avg_hr, 136);
  assert.equal(parsed.avg_pace_sec, 450);
});
