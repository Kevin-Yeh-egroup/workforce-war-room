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

function formatTime(value) {
  if (!value) return '尚未標示';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function badgeClass(value) {
  if (value === 'active' || value === 'worked' || value === '有連結') return 'green';
  if (value === 'paused' || value === '待補') return 'red';
  if (value === 'history_only' || value === '有狀態') return 'amber';
  return 'blue';
}

function badge(value) {
  return `<span class="badge ${badgeClass(value)}">${escapeHtml(value)}</span>`;
}

function metric(label, value, hint) {
  return `<article class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></article>`;
}

function resumeBadge(person) {
  if (person.resume?.url) return badge('有連結');
  if (person.resume?.label) return badge('有狀態');
  return badge('待補');
}

function resumeLink(person) {
  const label = person.resume?.label || '履歷';
  if (person.resume?.url) return `<a class="tool" href="${escapeHtml(person.resume.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  return `<span class="muted">${escapeHtml(label || '尚未提供履歷連結')}</span>`;
}

function months(person) {
  const max = Math.max(1, ...((person.monthlyWork || []).map((month) => Number(month.hours) || 0)));
  return (person.monthlyWork || []).map((month) => {
    const width = Math.max(2, Math.round(((Number(month.hours) || 0) / max) * 100));
    return `<div class="month">
      <strong>${escapeHtml(month.month)}</strong>
      <div class="muted">${escapeHtml(month.hours)} 小時</div>
      <div class="bar"><span style="--width:${width}%"></span></div>
    </div>`;
  }).join('');
}

function signals(person) {
  const items = (person.topWorkSignals || []).map((signal) => badge(`${signal.label}: ${signal.hours}h`));
  if (person.dictionaryWorkMinutes) items.unshift(badge(`名詞庫 ${person.dictionaryWorkMinutes}m`));
  return items.join('') || '<span class="muted">尚無分類訊號</span>';
}

function personCard(person) {
  const role = person.currentRole || person.educationOrJob || '未填基本背景';
  return `<article class="card person-card">
    <div class="person-head">
      <div>
        <h3>${escapeHtml(person.name)}</h3>
        <div class="muted">${escapeHtml(role)}</div>
      </div>
      <div class="badges">${badge(person.status)}${resumeBadge(person)}</div>
    </div>
    <div class="kv">
      <div class="k">目前工作狀態</div><div class="v">${escapeHtml(person.workStatus || '—')}</div>
      <div class="k">聯繫狀況</div><div class="v">${escapeHtml(person.contactStatus || '—')}</div>
      <div class="k">工作等級</div><div class="v">${escapeHtml(person.workLevel || '—')}</div>
      <div class="k">介紹／來源</div><div class="v">${escapeHtml(person.referrer || '—')}</div>
      <div class="k">履歷</div><div class="v">${resumeLink(person)}</div>
    </div>
    <div>
      <div class="muted">1–4 月工作情況</div>
      <div class="month-grid" style="margin-top:8px">${months(person)}</div>
    </div>
    <div>
      <div class="muted">主要工作訊號</div>
      <div class="signals" style="margin-top:8px">${signals(person)}</div>
    </div>
    <div class="toolbar" style="justify-content:flex-start">
      <a class="tool primary" href="/talent-pool/${encodeURIComponent(person.slug)}/index.html">打開個人追蹤頁</a>
    </div>
  </article>`;
}

function searchable(person) {
  return [
    person.name,
    person.status,
    person.currentRole,
    person.educationOrJob,
    person.workStatus,
    person.contactStatus,
    person.workLevel,
    person.referrer,
    person.notes,
    person.resume?.label,
    ...(person.topWorkSignals || []).map((signal) => signal.label)
  ].filter(Boolean).join(' ').toLowerCase();
}

function filterPeople(people) {
  const query = (document.getElementById('q').value || '').trim().toLowerCase();
  const status = document.getElementById('status').value;
  const resume = document.getElementById('resume').value;
  const level = document.getElementById('level').value;
  return people.filter((person) => {
    if (status && person.status !== status) return false;
    if (level && String(person.workLevel || '') !== level) return false;
    if (resume === 'link' && !person.resume?.url) return false;
    if (resume === 'status' && !(person.resume?.url || person.resume?.label)) return false;
    if (resume === 'missing' && (person.resume?.url || person.resume?.label)) return false;
    if (query && !searchable(person).includes(query)) return false;
    return true;
  });
}

async function main() {
  const data = await loadTalentPool();
  const people = Array.isArray(data.people) ? data.people : [];
  const counts = data.meta?.counts || {};
  document.getElementById('sourceStatus').textContent = `資料更新：${formatTime(data.meta?.sourceModifiedAt || data.meta?.generatedAt)}｜月份：${(data.meta?.coveredMonths || []).join('、') || '尚未標示'}`;
  document.getElementById('metrics').innerHTML = [
    metric('人才總數', counts.total ?? people.length, `active ${counts.active ?? 0}／paused ${counts.paused ?? 0}`),
    metric('有歷史工時', counts.withHistory ?? 0, `1–4 月累計 ${counts.historyTotalHours ?? 0} 小時`),
    metric('履歷狀態', counts.withResumeStatus ?? 0, `其中有 URL：${counts.withResumeLink ?? 0}`),
    metric('名詞庫工作', `${counts.dictionaryWorkMinutes ?? 0}m`, '已併入每位工讀生工作訊號'),
    metric('隱私欄位', '已排除', '不含薪資金額／銀行／電話／Email')
  ].join('');

  const levels = [...new Set(people.map((person) => String(person.workLevel || '').trim()).filter(Boolean))].sort();
  const levelSelect = document.getElementById('level');
  levels.forEach((level) => {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = `等級 ${level}`;
    levelSelect.appendChild(option);
  });

  const render = () => {
    const filtered = filterPeople(people);
    document.getElementById('peopleGrid').innerHTML = filtered.map(personCard).join('') || '<div class="panel empty" style="grid-column:span 12">沒有符合條件的人才資料。</div>';
  };
  ['q', 'status', 'resume', 'level'].forEach((id) => {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });
  render();
}

main().catch((error) => {
  document.getElementById('sourceStatus').textContent = '載入失敗';
  document.getElementById('peopleGrid').innerHTML = `<div class="panel empty" style="grid-column:span 12">載入失敗：${escapeHtml(error.message || String(error))}</div>`;
});
