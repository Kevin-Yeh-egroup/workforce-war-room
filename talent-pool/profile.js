async function loadTalentPool() {
  const response = await fetch('/data/talent-pool.internal.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badge(value) {
  const cls = value === 'active' || value === '有連結' ? 'green' : value === 'paused' || value === '待補' ? 'red' : 'blue';
  return `<span class="badge ${cls}">${escapeHtml(value)}</span>`;
}

function getSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[1] : '';
}

function resume(person) {
  if (person.resume?.url) return `<a class="tool primary" href="${escapeHtml(person.resume.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(person.resume.label || '履歷')}</a>`;
  return `<span class="muted">${escapeHtml(person.resume?.label || '尚未提供履歷連結')}</span>`;
}

function months(person) {
  const max = Math.max(1, ...((person.monthlyWork || []).map((month) => Number(month.hours) || 0)));
  return (person.monthlyWork || []).map((month) => {
    const width = Math.max(2, Math.round(((Number(month.hours) || 0) / max) * 100));
    return `<div class="month">
      <strong>${escapeHtml(month.month)}</strong>
      <div class="muted">${escapeHtml(month.hours)} 小時｜${escapeHtml(month.status)}</div>
      <div class="bar"><span style="--width:${width}%"></span></div>
    </div>`;
  }).join('');
}

function signals(person) {
  const items = (person.topWorkSignals || []).map((signal) => badge(`${signal.label}: ${signal.hours}h`));
  if (person.dictionaryWorkMinutes) items.unshift(badge(`名詞庫 ${person.dictionaryWorkMinutes}m`));
  return items.join('') || '<span class="muted">尚無分類訊號</span>';
}

function render(person, meta) {
  document.title = `${person.name}｜工讀生個人追蹤`;
  document.getElementById('title').textContent = person.name;
  document.getElementById('sourceStatus').textContent = `累計 ${person.historyTotalHours || 0} 小時｜有工時月份 ${person.monthsWithHours || 0}｜資料：${meta?.coveredMonths?.join('、') || '未標示'}`;
  document.getElementById('profileCard').innerHTML = `
    <div class="person-head">
      <div>
        <h2 style="margin:0 0 6px">${escapeHtml(person.name)}</h2>
        <div class="muted">${escapeHtml(person.currentRole || person.educationOrJob || '未填基本背景')}</div>
      </div>
      <div class="badges">${badge(person.status)}${badge(person.resume?.url ? '有連結' : person.resume?.label ? '有狀態' : '待補')}</div>
    </div>
    <div class="kv" style="margin-top:16px">
      <div class="k">現職</div><div class="v">${escapeHtml(person.currentRole || '—')}</div>
      <div class="k">學歷/職業</div><div class="v">${escapeHtml(person.educationOrJob || '—')}</div>
      <div class="k">目前工作狀態</div><div class="v">${escapeHtml(person.workStatus || '—')}</div>
      <div class="k">聯繫狀況</div><div class="v">${escapeHtml(person.contactStatus || '—')}</div>
      <div class="k">工作等級</div><div class="v">${escapeHtml(person.workLevel || '—')}</div>
      <div class="k">介紹／來源</div><div class="v">${escapeHtml(person.referrer || '—')}</div>
      <div class="k">履歷</div><div class="v">${resume(person)}</div>
      <div class="k">備註</div><div class="v">${escapeHtml(person.notes || '—')}</div>
    </div>
    <h2 style="font-size:17px;margin:22px 0 10px">每月工作情況</h2>
    <div class="month-grid">${months(person)}</div>
    <h2 style="font-size:17px;margin:22px 0 10px">工作訊號</h2>
    <div class="signals">${signals(person)}</div>
  `;
}

async function main() {
  const data = await loadTalentPool();
  const slug = getSlug();
  const person = (data.people || []).find((item) => item.slug === slug);
  if (!person) throw new Error(`找不到工讀生：${slug}`);
  render(person, data.meta || {});
}

main().catch((error) => {
  document.getElementById('sourceStatus').textContent = '載入失敗';
  document.getElementById('profileCard').innerHTML = `<div class="empty">載入失敗：${escapeHtml(error.message || String(error))}</div>`;
});
