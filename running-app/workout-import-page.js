import { analyzeWorkout, formatDuration, formatPace, parseWorkoutScreens } from './workout-image-parser.js';

const API_URL = '/api/running';
const state = { files: [], urls: [], parsed: null, context: null };
const byId = id => document.getElementById(id);

function localDate() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function secondsFromClock(value) {
  const parts = String(value || '').match(/\d+/g)?.map(Number) || [];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

async function apiGet(action, params = {}) {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => value !== '' && value != null && url.searchParams.set(key, value));
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.status === 'error') throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

async function apiPost(action, payload) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json();
  if (!response.ok || data.status === 'error') throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function toggleTheme() {
  const html = document.documentElement;
  const dark = !html.classList.contains('dark');
  html.classList.toggle('dark', dark);
  localStorage.setItem('elite_theme', dark ? 'dark' : 'light');
  byId('themeIcon').textContent = dark ? 'light_mode' : 'dark_mode';
}

function initializeTheme() {
  const saved = localStorage.getItem('elite_theme');
  const dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  byId('themeIcon').textContent = dark ? 'light_mode' : 'dark_mode';
}

function clearFiles() {
  state.urls.forEach(url => URL.revokeObjectURL(url));
  state.files = [];
  state.urls = [];
  byId('imageInput').value = '';
  byId('previewGrid').replaceChildren();
  byId('previewArea').classList.add('hidden');
  byId('progressArea').classList.add('hidden');
  byId('errorBox').classList.add('hidden');
}

function renderFiles(files) {
  clearFiles();
  state.files = files.filter(file => file.type.startsWith('image/')).slice(0, 8);
  if (!state.files.length) return showError('กรุณาเลือกไฟล์ภาพหน้าจอ');
  const grid = byId('previewGrid');
  state.files.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    state.urls.push(url);
    const wrap = document.createElement('div');
    wrap.className = 'relative aspect-[3/4] rounded-2xl overflow-hidden bg-black';
    const image = document.createElement('img');
    image.src = url;
    image.alt = `ภาพที่ ${index + 1}`;
    image.className = 'w-full h-full object-cover';
    const badge = document.createElement('span');
    badge.className = 'absolute top-2 left-2 w-6 h-6 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center';
    badge.textContent = index + 1;
    wrap.append(image, badge);
    grid.append(wrap);
  });
  byId('fileCount').textContent = `${state.files.length} ภาพ`;
  byId('previewArea').classList.remove('hidden');
}

function showError(message) {
  const box = byId('errorBox');
  box.textContent = message;
  box.classList.remove('hidden');
}

function setProgress(percent, text) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  byId('progressArea').classList.remove('hidden');
  byId('progressBar').style.width = `${value}%`;
  byId('progressPercent').textContent = `${value}%`;
  byId('progressText').textContent = text;
}

async function loadDrawable(file) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return { drawable: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('เปิดภาพไม่ได้'));
    image.src = url;
  });
  return { drawable: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

async function prepareImageForOcr(file) {
  let source;
  try {
    source = await loadDrawable(file);
    const targetWidth = Math.min(1600, Math.max(1300, source.width));
    const scale = targetWidth / source.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source.drawable, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let sampleTotal = 0;
    let sampleCount = 0;
    const sampleStep = Math.max(4, Math.floor(pixels.data.length / 16000 / 4) * 4);
    for (let index = 0; index < pixels.data.length; index += sampleStep) {
      sampleTotal += Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      sampleCount += 1;
    }
    const darkScreenshot = sampleTotal / sampleCount < 125;
    for (let index = 0; index < pixels.data.length; index += 4) {
      const brightness = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      const ink = darkScreenshot ? brightness > 65 : brightness < 185;
      const value = ink ? 0 : 255;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('เตรียมภาพไม่ได้')), 'image/png'));
  } catch {
    return file;
  } finally {
    source?.close();
  }
}

async function loadContext(date) {
  try {
    const output = await apiGet('getLogContext', { date });
    state.context = output.context || {};
    byId('linkedWorkoutId').value = state.context.workout?.workout_id || '';
  } catch {
    state.context = null;
    byId('linkedWorkoutId').value = '';
  }
}

async function analyzeImages() {
  if (!state.files.length) return showError('กรุณาเลือกภาพก่อน');
  if (!window.Tesseract?.createWorker) return showError('โหลดระบบ OCR ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วรีเฟรช');
  byId('errorBox').classList.add('hidden');
  byId('analyzeButton').disabled = true;
  byId('resultSection').classList.add('hidden');
  let worker;
  const texts = [];
  let currentIndex = 0;
  try {
    setProgress(1, 'กำลังโหลดระบบอ่านภาพ…');
    worker = await window.Tesseract.createWorker('eng', 1, {
      logger: message => {
        const local = Number(message.progress || 0);
        const overall = ((currentIndex + local) / state.files.length) * 100;
        const labels = { 'loading tesseract core': 'กำลังเตรียม OCR', 'initializing tesseract': 'กำลังเริ่ม OCR', 'loading language traineddata': 'กำลังโหลดภาษา', 'recognizing text': `กำลังอ่านภาพ ${currentIndex + 1}/${state.files.length}` };
        setProgress(overall, labels[message.status] || `กำลังประมวลผลภาพ ${currentIndex + 1}/${state.files.length}`);
      }
    });
    await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
    for (currentIndex = 0; currentIndex < state.files.length; currentIndex += 1) {
      setProgress(currentIndex / state.files.length * 100, `กำลังปรับภาพ ${currentIndex + 1}/${state.files.length}`);
      const preparedImage = await prepareImageForOcr(state.files[currentIndex]);
      const result = await worker.recognize(preparedImage);
      texts.push(result.data.text || '');
    }
    setProgress(96, 'กำลังรวมข้อมูลและวิเคราะห์…');
    const fallbackDate = state.files[0]?.lastModified ? new Date(state.files[0].lastModified).toISOString().slice(0, 10) : localDate();
    state.parsed = parseWorkoutScreens(texts, { fallbackDate });
    await loadContext(state.parsed.date);
    renderResult(state.parsed);
    setProgress(100, 'วิเคราะห์เสร็จแล้ว');
    setTimeout(() => byId('progressArea').classList.add('hidden'), 900);
    byId('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showError(`อ่านภาพไม่สำเร็จ: ${error.message || error}`);
    setProgress(0, 'หยุดการวิเคราะห์');
  } finally {
    if (worker) await worker.terminate();
    byId('analyzeButton').disabled = false;
  }
}

function metricCard(label, value, tone = '') {
  return `<div class="rounded-2xl bg-page dark:bg-[#121212] border border-borderLight dark:border-[#303030] p-4"><div class="text-[9px] font-bold text-muted uppercase">${escapeHtml(label)}</div><div class="text-xl md:text-2xl font-black mt-1 ${tone}">${escapeHtml(value)}</div></div>`;
}

function renderResult(data) {
  const analysis = analyzeWorkout(data, state.context?.workout || {});
  byId('resultHeadline').textContent = analysis.headline;
  byId('resultSubline').textContent = `${data.splits.length} splits · ${data.zones.length} HR zones · ตรวจตัวเลขก่อนบันทึก`;
  byId('confidenceText').textContent = `${data.confidence}%`;
  byId('metricGrid').innerHTML = [
    metricCard('Distance', data.distance_km ? `${data.distance_km.toFixed(2)} km` : '-', 'text-sky-500'),
    metricCard('Workout time', formatDuration(data.duration_sec), 'text-yellow-500'),
    metricCard('Avg pace', formatPace(data.avg_pace_sec), 'text-cyan-500'),
    metricCard('Avg heart rate', data.avg_hr ? `${data.avg_hr} bpm` : '-', 'text-red-500'),
    metricCard('Avg power', data.avg_power ? `${data.avg_power} W` : '-', 'text-lime-500'),
    metricCard('Cadence', data.cadence ? `${data.cadence} spm` : '-', 'text-cyan-500'),
    metricCard('Vert. oscillation', data.vertical_osc_cm ? `${data.vertical_osc_cm} cm` : '-'),
    metricCard('Ground contact', data.gct_ms ? `${data.gct_ms} ms` : '-')
  ].join('');
  byId('insightList').innerHTML = analysis.insights.map(text => `<div class="flex gap-3 rounded-2xl bg-green-50 dark:bg-green-950/20 p-4 text-sm"><span class="material-icons-round text-green-600 text-lg">check_circle</span><span>${escapeHtml(text)}</span></div>`).join('');
  byId('warningList').innerHTML = analysis.warnings.map(text => `<div class="flex gap-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 p-4 text-sm"><span class="material-icons-round text-amber-600 text-lg">warning</span><span>${escapeHtml(text)}</span></div>`).join('');
  renderZones(data.zones);
  renderSplits(data.splits);
  fillForm(data, analysis.note);
  byId('rawText').textContent = data.raw_text;
  byId('resultSection').classList.remove('hidden');
}

function renderZones(zones) {
  const total = zones.reduce((sum, zone) => sum + zone.seconds, 0);
  byId('zoneList').innerHTML = zones.length ? zones.map(zone => {
    const ratio = total ? zone.seconds / total * 100 : 0;
    const colors = ['bg-sky-500', 'bg-cyan-400', 'bg-lime-400', 'bg-orange-500', 'bg-pink-500'];
    return `<div><div class="flex justify-between text-xs"><span>Zone ${zone.zone}</span><span>${formatDuration(zone.seconds)} · ${Math.round(ratio)}%</span></div><div class="h-2 bg-black/5 dark:bg-white/5 rounded-full mt-1 overflow-hidden"><div class="h-full ${colors[zone.zone - 1]} rounded-full" style="width:${ratio}%"></div></div></div>`;
  }).join('') : '<div class="text-sm text-muted">ไม่พบภาพ Heart Rate Zones</div>';
}

function renderSplits(splits) {
  if (!splits.length) {
    byId('splitList').innerHTML = '<div class="text-sm text-muted">ไม่พบภาพ Splits</div>';
    return;
  }
  byId('splitList').innerHTML = `<table class="w-full text-xs min-w-[430px]"><thead class="text-muted"><tr><th class="text-left py-2">KM</th><th class="text-left">Pace</th><th class="text-left">HR</th><th class="text-left">Power</th><th class="text-left">SPM</th></tr></thead><tbody>${splits.map(split => `<tr class="border-t border-borderLight dark:border-[#303030]"><td class="py-2">${split.kilometer}</td><td class="text-cyan-500 font-semibold">${formatPace(split.pace_sec)}</td><td class="text-red-500">${split.heart_rate}</td><td class="text-lime-500">${split.power}</td><td>${split.cadence}</td></tr>`).join('')}</tbody></table>`;
}

function setValue(id, value) {
  byId(id).value = value == null ? '' : value;
}

function fillForm(data, note) {
  setValue('dateInput', data.date || localDate());
  setValue('typeInput', state.context?.workout?.workout_type || data.workout_type || 'Easy');
  setValue('distanceInput', data.distance_km);
  setValue('durationInput', formatDuration(data.duration_sec));
  setValue('avgHrInput', data.avg_hr);
  setValue('cadenceInput', data.cadence);
  setValue('powerInput', data.avg_power);
  setValue('verticalInput', data.vertical_osc_cm);
  setValue('gctInput', data.gct_ms);
  setValue('strideInput', data.stride_len_m);
  setValue('elevationInput', data.elevation_gain);
  setValue('rpeInput', data.rpe || state.context?.workout?.target_rpe || 5);
  setValue('painInput', 0);
  setValue('notesInput', `วิเคราะห์จากภาพ Apple Fitness: ${note}`);
}

function formNumber(formData, key) {
  const value = formData.get(key);
  return value === '' || value == null ? '' : Number(value);
}

async function saveWorkout(event) {
  event.preventDefault();
  const button = byId('saveButton');
  const status = byId('saveStatus');
  const formData = new FormData(event.currentTarget);
  const durationSeconds = secondsFromClock(byId('durationInput').value);
  if (!durationSeconds) return showSaveStatus('กรุณาตรวจรูปแบบเวลา เช่น 0:47:26', false);
  const activity = {
    linked_workout_id: formData.get('linked_workout_id') || '',
    date: formData.get('date'),
    type: formData.get('type'),
    workout_type: formData.get('type'),
    distance_km: formNumber(formData, 'distance_km'),
    duration_min: Number((durationSeconds / 60).toFixed(2)),
    avg_hr: formNumber(formData, 'avg_hr'),
    cadence: formNumber(formData, 'cadence'),
    avg_power: formNumber(formData, 'avg_power'),
    power_source: formData.get('avg_power') ? 'device' : '',
    vertical_osc_cm: formNumber(formData, 'vertical_osc_cm'),
    gct_ms: formNumber(formData, 'gct_ms'),
    stride_len_m: formNumber(formData, 'stride_len_m'),
    elevation_gain: formNumber(formData, 'elevation_gain'),
    rpe: formNumber(formData, 'rpe'),
    pain_score: formNumber(formData, 'pain_score'),
    notes: formData.get('notes') || ''
  };
  button.disabled = true;
  button.lastChild.textContent = ' กำลังบันทึก…';
  status.classList.add('hidden');
  try {
    const output = await apiPost('saveActivity', { activity });
    const result = output.activity || {};
    showSaveStatus(`บันทึกแล้ว · ${result.post_run_status || 'สำเร็จ'}${result.compliance_score != null ? ` · score ${result.compliance_score}` : ''} · กำลังเปิด Dashboard`, true);
    setTimeout(() => { window.location.href = 'index.html?updated=1'; }, 1100);
  } catch (error) {
    showSaveStatus(error.message || 'บันทึกไม่สำเร็จ', false);
  } finally {
    button.disabled = false;
    button.lastChild.textContent = ' บันทึกผลการวิ่ง';
  }
}

function showSaveStatus(message, success) {
  const status = byId('saveStatus');
  status.className = `rounded-2xl p-4 text-sm text-center ${success ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'}`;
  status.textContent = message;
}

initializeTheme();
byId('dateInput').value = localDate();
byId('themeButton').addEventListener('click', toggleTheme);
byId('imageInput').addEventListener('change', event => renderFiles([...event.target.files]));
byId('clearButton').addEventListener('click', clearFiles);
byId('analyzeButton').addEventListener('click', analyzeImages);
byId('reviewForm').addEventListener('submit', saveWorkout);
byId('dateInput').addEventListener('change', event => loadContext(event.target.value));
loadContext(localDate());
