import { buildFitnessSummary } from './fitness-summary.js';

const API_URL = '/api/running';
const html = document.documentElement;
const charts = [];
let dashboardData = {};

const byId = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function localDate() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

function initializeTheme() {
  const saved = localStorage.getItem('elite_theme');
  const dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
  html.classList.toggle('dark', dark);
  byId('themeIcon').textContent = dark ? 'light_mode' : 'dark_mode';
}

function toggleTheme() {
  const dark = !html.classList.contains('dark');
  html.classList.toggle('dark', dark);
  localStorage.setItem('elite_theme', dark ? 'dark' : 'light');
  byId('themeIcon').textContent = dark ? 'light_mode' : 'dark_mode';
  renderCharts(dashboardData);
}

async function loadDashboard() {
  byId('refreshButton').disabled = true;
  byId('refreshButton').querySelector('span').classList.add('animate-spin');
  byId('errorNotice').classList.add('hidden');
  try {
    const [dashboardResult, todayResult] = await Promise.allSettled([
      apiGet('getDashboardSummary'),
      apiGet('getToday', { date: localDate() })
    ]);
    if (dashboardResult.status === 'rejected' && todayResult.status === 'rejected') throw dashboardResult.reason;
    dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value.dashboard || {} : {};
    const today = todayResult.status === 'fulfilled' ? todayResult.value.today || {} : {};
    renderDashboard(dashboardData, today);
  } catch (error) {
    const box = byId('errorNotice');
    box.textContent = `โหลด Dashboard ไม่สำเร็จ: ${error.message || error}`;
    box.classList.remove('hidden');
  } finally {
    byId('refreshButton').disabled = false;
    byId('refreshButton').querySelector('span').classList.remove('animate-spin');
  }
}

function renderDashboard(dashboard, today) {
  const summary = buildFitnessSummary(dashboard, today);
  byId('fitnessScore').textContent = summary.hasData ? summary.score : '—';
  byId('fitnessLabel').textContent = summary.label;
  byId('fitnessSummary').textContent = summary.short;
  byId('fitnessBar').style.width = `${summary.hasData ? summary.score : 0}%`;
  byId('readinessValue').textContent = summary.readiness || '—';
  byId('distanceValue').textContent = formatNumber(summary.last7Km);
  byId('consistencyValue').textContent = summary.consistency || '—';
  byId('actionTitle').textContent = summary.action.title;
  byId('actionMessage').textContent = summary.action.message;
  byId('riskTitle').textContent = summary.risk;
  byId('riskMessage').textContent = summary.loadComment;
  byId('distance28Value').textContent = `${formatNumber(summary.last28Km)} km`;
  byId('loadRatioValue').textContent = formatNumber(dashboard.load?.load_ratio || 0);
  byId('lastUpdated').textContent = `อัปเดต ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`;
  renderRecent(summary.recent);
  renderCharts(dashboard);
}

function renderRecent(activity) {
  const box = byId('recentRun');
  if (!activity) {
    box.innerHTML = `<a href="import.html" class="rounded-[24px] border-2 border-dashed border-accent/30 p-6 flex items-center gap-4"><span class="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center"><span class="material-icons-round">add_photo_alternate</span></span><span><span class="font-semibold block">ยังไม่มีข้อมูลการวิ่ง</span><span class="text-sm text-muted">อัปโหลดภาพเพื่อสร้าง Dashboard ครั้งแรก</span></span></a>`;
    return;
  }
  const details = [
    activity.duration_min ? `${formatNumber(activity.duration_min)} นาที` : '',
    activity.avg_hr ? `HR ${activity.avg_hr}` : '',
    activity.cadence ? `${activity.cadence} spm` : '',
    activity.rpe ? `RPE ${activity.rpe}` : ''
  ].filter(Boolean).join(' · ');
  box.innerHTML = `<div class="rounded-[24px] bg-page dark:bg-[#121212] border border-line dark:border-[#303030] p-5"><div class="flex items-start justify-between gap-4"><div><div class="text-xs text-muted">${escapeHtml(formatDate(activity.date))} · ${escapeHtml(activity.type || activity.workout_type || 'Run')}</div><div class="text-3xl font-black text-accent mt-2">${formatNumber(activity.distance_km)} km</div><div class="text-sm text-muted mt-2">${escapeHtml(details || 'บันทึกผลแล้ว')}</div></div><div class="text-right"><div class="text-xs text-muted">ความตรงตามแผน</div><div class="text-3xl font-black mt-1">${escapeHtml(activity.compliance_score || '—')}</div></div></div>${activity.analysis_note || activity.notes ? `<p class="text-sm text-muted mt-4 pt-4 border-t border-line dark:border-[#303030] line-clamp-3">${escapeHtml(activity.analysis_note || activity.notes)}</p>` : ''}</div>`;
}

function renderCharts(dashboard) {
  while (charts.length) charts.pop()?.destroy();
  if (!window.Chart) {
    toggleEmpty('readinessChart', 'readinessEmpty', false);
    toggleEmpty('weeklyChart', 'weeklyEmpty', false);
    byId('readinessEmpty').textContent = 'โหลดระบบกราฟไม่สำเร็จ แต่ข้อมูลสรุปยังใช้งานได้';
    byId('weeklyEmpty').textContent = 'โหลดระบบกราฟไม่สำเร็จ แต่ข้อมูลสรุปยังใช้งานได้';
    return;
  }
  const isDark = html.classList.contains('dark');
  const textColor = isDark ? '#D6D3D1' : '#57534E';
  const gridColor = isDark ? '#292929' : '#ECE8E2';
  window.Chart.defaults.color = textColor;
  window.Chart.defaults.font.family = 'Kanit, sans-serif';
  window.Chart.defaults.borderColor = gridColor;

  const readiness = dashboard.readiness_series || [];
  toggleEmpty('readinessChart', 'readinessEmpty', readiness.length > 1);
  if (readiness.length > 1) {
    charts.push(new Chart(byId('readinessChart'), {
      type: 'line',
      data: { labels: readiness.map(item => formatShortDate(item.date)), datasets: [{ data: readiness.map(item => Number(item.readiness_score || 0)), borderColor: '#FC4C02', backgroundColor: 'rgba(252,76,2,.10)', fill: true, tension: .4, pointRadius: 2, pointBackgroundColor: '#FC4C02' }] },
      options: chartOptions({ min: 0, max: 100 })
    }));
  }

  const weekly = dashboard.weekly || [];
  toggleEmpty('weeklyChart', 'weeklyEmpty', weekly.length > 0);
  if (weekly.length) {
    charts.push(new Chart(byId('weeklyChart'), {
      type: 'bar',
      data: { labels: weekly.map(item => formatShortDate(item.week_start)), datasets: [{ label: 'วิ่งจริง', data: weekly.map(item => Number(item.actual_km || 0)), backgroundColor: '#FC4C02', borderRadius: 8 }, { label: 'ตามแผน', data: weekly.map(item => Number(item.planned_km || 0)), backgroundColor: isDark ? '#3A3A3A' : '#DDD8D1', borderRadius: 8 }] },
      options: chartOptions({ legend: true })
    }));
  }
}

function chartOptions(options = {}) {
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: Boolean(options.legend), position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { displayColors: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: true, min: options.min, max: options.max, grid: { color: html.classList.contains('dark') ? '#292929' : '#ECE8E2' }, ticks: { maxTicksLimit: 5 } } } };
}

function toggleEmpty(canvasId, emptyId, hasData) {
  byId(canvasId).classList.toggle('hidden', !hasData);
  byId(emptyId).classList.toggle('hidden', hasData);
  byId(emptyId).classList.toggle('flex', !hasData);
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatDate(value) {
  try { return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return value || 'ล่าสุด'; }
}

function formatShortDate(value) {
  try { return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } catch { return value || ''; }
}

initializeTheme();
if (new URLSearchParams(location.search).get('updated') === '1') byId('updatedNotice').classList.remove('hidden');
byId('themeButton').addEventListener('click', toggleTheme);
byId('refreshButton').addEventListener('click', loadDashboard);
window.addEventListener('resize', () => charts.forEach(chart => chart.resize()));
loadDashboard();
