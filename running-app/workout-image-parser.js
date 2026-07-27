const MONTHS = Object.freeze({
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstMatch(text, pattern, group = 1) {
  return text.match(pattern)?.[group] ?? '';
}

function parseClock(value) {
  const parts = String(value || '').match(/\d+/g)?.map(Number) || [];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function paceSeconds(minutes, seconds) {
  const min = finite(minutes);
  const sec = finite(seconds);
  return min === null || sec === null ? null : min * 60 + sec;
}

function isoDateFromText(text, fallbackDate) {
  const match = text.match(/\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*,?\s+(\d{1,2})\s+([A-Z]{3})\b/i);
  if (!match) return fallbackDate;
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return fallbackDate;
  const fallback = new Date(`${fallbackDate}T12:00:00`);
  const date = new Date(fallback.getFullYear(), month, Number(match[1]), 12);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function normalizeOcrText(value) {
  return String(value || '')
    .replace(/[’′`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐‑–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function parseZones(text) {
  const zones = [];
  const pattern = /ZONE\s*([1-5])[\s\S]{0,45}?(\d{1,2})\s*:\s*(\d{2})/gi;
  for (const match of text.matchAll(pattern)) {
    const zone = Number(match[1]);
    if (zones.some(item => item.zone === zone)) continue;
    zones.push({ zone, seconds: Number(match[2]) * 60 + Number(match[3]) });
  }
  return zones.sort((a, b) => a.zone - b.zone);
}

function parseSplits(text) {
  const section = text.match(/SPLITS[\s\S]*?(?=WORKOUT DETAILS|HEART RATE|POST-WORKOUT|$)/i)?.[0] || text;
  const splits = [];
  const pattern = /(?:^|\n)\s*(\d{1,2})\s+(\d{1,2})\s*[':]\s*(\d{2})\s*"?\s*\/?\s*KM[\s|,;:-]+(\d{2,3})\s*BPM[\s|,;:-]+(\d{2,3})\s*W[\s|,;:-]+(\d{2,3})\s*SPM/gi;
  for (const match of section.matchAll(pattern)) {
    const kilometer = Number(match[1]);
    if (kilometer < 1 || kilometer > 100 || splits.some(item => item.kilometer === kilometer)) continue;
    splits.push({
      kilometer,
      pace_sec: paceSeconds(match[2], match[3]),
      heart_rate: Number(match[4]),
      power: Number(match[5]),
      cadence: Number(match[6])
    });
  }
  return splits.sort((a, b) => a.kilometer - b.kilometer);
}

function parseRecovery(text) {
  const section = text.match(/POST-WORKOUT HEART RATE[\s\S]*$/i)?.[0] || '';
  const values = [...section.matchAll(/\b(\d{2,3})\s*BPM\b/gi)].map(match => Number(match[1]));
  if (values.length < 2) return null;
  return {
    finish_bpm: values[0],
    one_min_bpm: values[1] ?? null,
    two_min_bpm: values[2] ?? null
  };
}

export function parseWorkoutScreens(ocrTexts, options = {}) {
  const fallbackDate = options.fallbackDate || new Date().toISOString().slice(0, 10);
  const text = normalizeOcrText(Array.isArray(ocrTexts) ? ocrTexts.join('\n\n') : ocrTexts);
  const upper = text.toUpperCase();
  const durationValue = firstMatch(upper, /WORKOUT TIME[\s\S]{0,35}?(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/i);
  const paceMatch = upper.match(/AVG\.?\s*PACE[\s\S]{0,35}?(\d{1,2})\s*[':]\s*(\d{2})/i);
  const elapsedValue = firstMatch(upper, /ELAPSED TIME[\s\S]{0,35}?(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/i);
  const effortMatch = upper.match(/EFFORT[\s\S]{0,28}?\b(10|[1-9])\b/i);
  const verticalMatch = upper.match(/VERTICAL OSCILLATION[\s\S]{0,45}?AVERAGE\s*:?\s*(\d+(?:\.\d+)?)\s*CM/i);
  const gctMatch = upper.match(/GROUND CONTACT TIME[\s\S]{0,45}?AVERAGE\s*:?\s*(\d+(?:\.\d+)?)\s*MS/i);
  const strideMatch = upper.match(/STRIDE LENGTH[\s\S]{0,45}?AVERAGE\s*:?\s*(\d+(?:\.\d+)?)\s*M\b/i);

  const result = {
    date: isoDateFromText(upper, fallbackDate),
    workout_type: /OUTDOOR RUN/i.test(upper) ? 'Easy' : 'Easy',
    duration_sec: parseClock(durationValue),
    elapsed_sec: parseClock(elapsedValue),
    distance_km: finite(firstMatch(upper, /DISTANCE[\s\S]{0,24}?(\d+(?:\.\d+)?)\s*KM/i)),
    active_kcal: finite(firstMatch(upper, /ACTIVE KILOCALORIES[\s\S]{0,24}?(\d+)\s*KCAL/i)),
    total_kcal: finite(firstMatch(upper, /TOTAL KILOCALORIES[\s\S]{0,24}?(\d+)\s*KCAL/i)),
    elevation_gain: finite(firstMatch(upper, /ELEVATION GAIN[\s\S]{0,24}?(\d+(?:\.\d+)?)\s*M/i)),
    avg_power: finite(firstMatch(upper, /AVG\.?\s*POWER[\s\S]{0,24}?(\d+)\s*W/i)),
    cadence: finite(firstMatch(upper, /AVG\.?\s*CADENCE[\s\S]{0,24}?(\d+)\s*SPM/i)),
    avg_pace_sec: paceMatch ? paceSeconds(paceMatch[1], paceMatch[2]) : null,
    avg_hr: finite(firstMatch(upper, /AVG\.?\s*HEART RATE[\s\S]{0,28}?(\d+)\s*BPM/i)),
    rpe: effortMatch ? Number(effortMatch[1]) : null,
    vertical_osc_cm: verticalMatch ? Number(verticalMatch[1]) : null,
    gct_ms: gctMatch ? Number(gctMatch[1]) : null,
    stride_len_m: strideMatch ? Number(strideMatch[1]) : null,
    zones: parseZones(upper),
    splits: parseSplits(upper),
    recovery: parseRecovery(upper),
    raw_text: text
  };

  if (!result.duration_sec && result.distance_km && result.avg_pace_sec) {
    result.duration_sec = Math.round(result.distance_km * result.avg_pace_sec);
  }
  if (!result.avg_pace_sec && result.duration_sec && result.distance_km) {
    result.avg_pace_sec = Math.round(result.duration_sec / result.distance_km);
  }

  const checks = [result.distance_km, result.duration_sec, result.avg_pace_sec, result.avg_hr, result.cadence, result.avg_power];
  result.confidence = Math.round((checks.filter(value => Number(value) > 0).length / checks.length) * 100);
  result.missing = [];
  if (!result.distance_km) result.missing.push('ระยะทาง');
  if (!result.duration_sec) result.missing.push('เวลา');
  if (!result.avg_hr) result.missing.push('หัวใจเฉลี่ย');
  if (!result.cadence) result.missing.push('cadence');
  return result;
}

function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function percent(value) {
  return `${Math.round(value)}%`;
}

export function formatPace(seconds) {
  const value = Math.round(Number(seconds || 0));
  if (!value) return '-';
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}/km`;
}

export function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function analyzeWorkout(data, planned = {}) {
  const insights = [];
  const warnings = [];
  const splitPaces = (data.splits || []).map(item => item.pace_sec);
  const splitHrs = (data.splits || []).map(item => item.heart_rate);
  const zoneSeconds = (data.zones || []).reduce((sum, item) => sum + item.seconds, 0);
  const easySeconds = (data.zones || []).filter(item => item.zone <= 2).reduce((sum, item) => sum + item.seconds, 0);

  if (data.distance_km && data.duration_sec) {
    insights.push(`วิ่ง ${Number(data.distance_km).toFixed(2)} กม. ใน ${formatDuration(data.duration_sec)} ที่ pace เฉลี่ย ${formatPace(data.avg_pace_sec)}`);
  }
  if (zoneSeconds) {
    const easyRatio = easySeconds / zoneSeconds * 100;
    insights.push(`หัวใจอยู่ Zone 1–2 ${percent(easyRatio)} ของเวลาที่วัดได้${easyRatio >= 85 ? ' เป็นงานแอโรบิกที่คุมความหนักได้ดี' : ''}`);
    if (easyRatio < 70) warnings.push('เวลานอก Zone 1–2 ค่อนข้างมากสำหรับวัน Easy/Recovery');
  } else if (data.avg_hr) {
    insights.push(`อัตราหัวใจเฉลี่ย ${data.avg_hr} bpm`);
  }

  if (splitPaces.length >= 3) {
    const spread = Math.max(...splitPaces) - Math.min(...splitPaces);
    const half = Math.floor(splitPaces.length / 2);
    const first = average(splitPaces.slice(0, half));
    const last = average(splitPaces.slice(-half));
    const direction = last < first - 3 ? `ช่วงท้ายเร็วขึ้น ${Math.round(first - last)} วินาที/กม.` : last > first + 3 ? `ช่วงท้ายช้าลง ${Math.round(last - first)} วินาที/กม.` : 'ความเร็วต้น–ท้ายใกล้เคียงกัน';
    insights.push(`Pace แต่ละกิโลต่างกัน ${spread} วินาที และ${direction}`);
  }
  if (splitHrs.length >= 3) {
    const drift = splitHrs.at(-1) - splitHrs[0];
    insights.push(`HR จากกิโลแรกถึงกิโลท้ายเปลี่ยน ${drift >= 0 ? '+' : ''}${drift} bpm${drift <= 15 ? ' อยู่ในระดับควบคุมได้' : ''}`);
    if (drift > 15) warnings.push('HR drift สูง ควรพิจารณาอากาศ ความล้า น้ำ และ pace ช่วงต้น');
  }

  if (data.recovery?.finish_bpm && data.recovery?.one_min_bpm) {
    const drop = data.recovery.finish_bpm - data.recovery.one_min_bpm;
    insights.push(`หัวใจลด ${drop} bpm ใน 1 นาทีหลังหยุด${drop >= 20 ? ' แสดงการฟื้นตัวหลังวิ่งที่ดีในครั้งนี้' : ''}`);
    if (drop < 12) warnings.push('การลดลงของ HR นาทีแรกค่อนข้างน้อย ควรติดตามร่วมกับความรู้สึกและความล้า');
  }
  if (data.cadence || data.vertical_osc_cm || data.gct_ms || data.stride_len_m) {
    const mechanics = [
      data.cadence ? `cadence ${data.cadence} spm` : '',
      data.vertical_osc_cm ? `vertical oscillation ${data.vertical_osc_cm} cm` : '',
      data.gct_ms ? `ground contact ${data.gct_ms} ms` : '',
      data.stride_len_m ? `stride ${data.stride_len_m} m` : ''
    ].filter(Boolean);
    insights.push(`Running dynamics: ${mechanics.join(', ')}`);
  }

  const plannedDistance = Number(planned.planned_distance_km || 0);
  const plannedDuration = Number(planned.planned_duration_min || 0);
  if (plannedDistance && data.distance_km) {
    const delta = (data.distance_km - plannedDistance) / plannedDistance * 100;
    insights.push(`ระยะจริงต่างจากแผน ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`);
  }
  if (plannedDuration && data.duration_sec) {
    const delta = (data.duration_sec / 60 - plannedDuration) / plannedDuration * 100;
    insights.push(`เวลาจริงต่างจากแผน ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`);
  }
  if (data.missing?.length) warnings.push(`OCR ยังอ่านไม่ครบ: ${data.missing.join(', ')} — กรุณาตรวจตัวเลขก่อนบันทึก`);

  const headline = warnings.length ? 'อ่านข้อมูลแล้ว — ควรตรวจบางจุด' : 'อ่านข้อมูลครบและพร้อมบันทึก';
  return {
    headline,
    insights,
    warnings,
    note: [...insights, ...warnings].join(' · ')
  };
}
