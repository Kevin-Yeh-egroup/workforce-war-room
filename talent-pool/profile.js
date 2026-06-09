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
  const cls = value === 'active' || value === '有連結' || value === '必要欄位完整' ? 'green' : value === 'paused' || value === '待補' || String(value).startsWith('缺 ') ? 'red' : 'blue';
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

function contactLine(person) {
  const phone = person.phone ? `<a href="tel:${escapeHtml(person.phone)}">${escapeHtml(person.phone)}</a>` : '<span class="muted">缺電話</span>';
  const email = person.email ? `<a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a>` : '<span class="muted">缺 Email</span>';
  return `${phone}<br>${email}`;
}

function missingLine(person) {
  const missing = person.missingRequiredFields || [];
  return missing.length ? missing.map((item) => badge(`缺 ${item}`)).join('') : badge('必要欄位完整');
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

function interviewSummary(person) {
  const summary = person.interviewSummary;
  if (!summary) return '';
  const points = (summary.points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join('');
  const nextWorkIdeas = (summary.nextWorkIdeas || []).map((idea) => `<li>${escapeHtml(idea)}</li>`).join('');
  return `<section class="section-card">
    <h2>會談摘要</h2>
    <div class="kv">
      <div class="k">紀錄日期</div><div class="v">${escapeHtml(summary.recordedAt || '未標示')}</div>
      <div class="k">重點摘要</div><div class="v">${escapeHtml(summary.headline || '—')}</div>
      <div class="k">背景線索</div><div class="v">${points ? `<ul class="summary-list">${points}</ul>` : '—'}</div>
      <div class="k">後續可試</div><div class="v">${nextWorkIdeas ? `<ul class="summary-list">${nextWorkIdeas}</ul>` : '—'}</div>
    </div>
  </section>`;
}

function humanIntel(person) {
  const notes = person.humanIntelNotes || [];
  if (!notes.length) return '';
  const items = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');
  return `<section class="section-card">
    <h2>人力情報</h2>
    <ul class="summary-list">${items}</ul>
  </section>`;
}

function render(person, meta) {
  document.title = `${person.name}｜工讀生個人追蹤`;
  document.getElementById('title').textContent = person.name;
  const coveredMonths = meta?.coveredMonths?.length ? meta.coveredMonths.join('、') : '逐月資料';
  const missingFields = person.missingRequiredFields?.length ? `待補：${person.missingRequiredFields.join('、')}` : '必要欄位完整';
  const missingBadge = person.missingRequiredFields?.length ? badge(`缺漏 ${person.missingRequiredFields.length}`) : badge('必要欄位完整');
  document.getElementById('sourceStatus').textContent = `累計 ${person.historyTotalHours || 0} 小時｜${missingFields}｜${coveredMonths}`;
  document.getElementById('profileCard').innerHTML = `
    <section class="section-card">
      <div class="person-head">
        <div>
          <h2 style="margin:0 0 6px">${escapeHtml(person.name)}</h2>
          <div class="person-role">${escapeHtml(person.employmentOrStudy || person.currentRole || person.educationOrJob || '未填基本背景')}</div>
        </div>
        <div class="badges">${badge(person.status)}${missingBadge}${badge(person.resume?.url ? '有履歷連結' : person.resume?.label ? '有履歷狀態' : '缺履歷')}</div>
      </div>
    </section>
    <div class="section-grid">
      <section class="section-card">
        <h2>基本資料</h2>
        <div class="kv">
          <div class="k">電話 / Email</div><div class="v">${contactLine(person)}</div>
          <div class="k">居住地</div><div class="v">${escapeHtml(person.residence || '待補')}</div>
          <div class="k">缺漏欄位</div><div class="v"><div class="badges inline-badges">${missingLine(person)}</div></div>
          <div class="k">現職</div><div class="v">${escapeHtml(person.currentRole || '—')}</div>
          <div class="k">學歷/職業</div><div class="v">${escapeHtml(person.educationOrJob || '—')}</div>
          <div class="k">介紹／來源</div><div class="v">${escapeHtml(person.referrer || '—')}</div>
        </div>
      </section>
      <section class="section-card">
        <h2>工作狀態</h2>
        <div class="kv">
          <div class="k">目前狀態</div><div class="v">${escapeHtml(person.workStatus || '—')}</div>
          <div class="k">聯繫狀況</div><div class="v">${escapeHtml(person.contactStatus || '—')}</div>
          <div class="k">工作範本</div><div class="v">${escapeHtml(person.workLevel || '—')}</div>
          <div class="k">缺漏</div><div class="v">${escapeHtml(missingFields)}</div>
          <div class="k">備註</div><div class="v">${escapeHtml(person.notes || '—')}</div>
        </div>
      </section>
    </div>
    ${humanIntel(person)}
    ${interviewSummary(person)}
    <section class="section-card">
      <h2>逐月工時</h2>
      <div class="month-grid">${months(person)}</div>
    </section>
    <section class="section-card">
      <h2>履歷與工作訊號</h2>
      <div class="kv">
        <div class="k">履歷</div><div class="v">${resume(person)}</div>
        <div class="k">工作訊號</div><div class="v"><div class="signals">${signals(person)}</div></div>
      </div>
    </section>
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
