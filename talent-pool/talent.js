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
  if (value === 'active' || value === 'worked' || value === '有連結' || value === '必要欄位完整') return 'green';
  if (value === 'paused' || value === '待補' || String(value).startsWith('缺 ')) return 'red';
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
  if (person.resume?.url) {
    const label = person.resume?.label || '履歷';
    return `<a class="tool" href="${escapeHtml(person.resume.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }
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
      <div class="muted">${escapeHtml(month.hours)} 小時</div>
      <div class="bar"><span style="--width:${width}%"></span></div>
    </div>`;
  }).join('');
}

function currentMonthWork(person) {
  const monthly = person.monthlyWork || [];
  if (!monthly.length) return { label: '本月', hours: 0 };
  const latest = monthly[monthly.length - 1];
  return { label: latest.month || '本月', hours: Number(latest.hours) || 0 };
}

function workTemplate(person) {
  const signals = (person.topWorkSignals || []).slice(0, 2).map((signal) => signal.label).filter(Boolean);
  if (signals.length) return signals.join('、');
  return person.workLevel ? `工作等級 ${person.workLevel}` : '尚未標示';
}

function hoursSummary(person) {
  const latest = currentMonthWork(person);
  return `<div class="summary-row">
    ${badge(`累計 ${person.historyTotalHours || 0}h`)}
    ${badge(`${latest.label} ${latest.hours}h`)}
  </div>`;
}

function signals(person) {
  const items = (person.topWorkSignals || []).map((signal) => badge(`${signal.label}: ${signal.hours}h`));
  if (person.dictionaryWorkMinutes) items.unshift(badge(`名詞庫 ${person.dictionaryWorkMinutes}m`));
  return items.join('') || '<span class="muted">尚無分類訊號</span>';
}

function interviewHeadline(person) {
  return person.interviewSummary?.headline || '';
}

function humanIntelNote(person) {
  return (person.humanIntelNotes || [])[0] || '';
}

function personCard(person) {
  const role = person.employmentOrStudy || person.currentRole || person.educationOrJob || '未填基本背景';
  const interview = interviewHeadline(person);
  const intel = humanIntelNote(person);
  return `<article class="card person-card">
    <div class="person-head">
      <div>
        <h3>${escapeHtml(person.name)}</h3>
        <div class="person-role clamp">${escapeHtml(role)}</div>
      </div>
      <div class="badges">${badge(person.status)}</div>
    </div>
    <div class="kv compact-kv">
      <div class="k">電話 / Email</div><div class="v">${contactLine(person)}</div>
      <div class="k">居住地</div><div class="v">${escapeHtml(person.residence || '待補')}</div>
      <div class="k">缺漏欄位</div><div class="v"><div class="badges inline-badges">${missingLine(person)}</div></div>
      <div class="k">工作範本</div><div class="v clamp">${escapeHtml(workTemplate(person))}</div>
      ${intel ? `<div class="k">人力情報</div><div class="v clamp">${escapeHtml(intel)}</div>` : ''}
      ${interview ? `<div class="k">會談摘要</div><div class="v clamp">${escapeHtml(interview)}</div>` : ''}
      <div class="k">工時摘要</div><div class="v">${hoursSummary(person)}</div>
    </div>
    <div class="toolbar" style="justify-content:flex-start">
      <a class="tool primary" href="/talent-pool/${encodeURIComponent(person.slug)}/index.html">打開個人追蹤頁</a>
    </div>
  </article>`;
}

function searchable(person) {
  return [
    person.name,
    person.phone,
    person.email,
    person.residence,
    person.employmentOrStudy,
    person.status,
    person.currentRole,
    person.educationOrJob,
    person.workStatus,
    person.contactStatus,
    person.workLevel,
    person.referrer,
    person.notes,
    ...(person.humanIntelNotes || []),
    person.interviewSummary?.headline,
    ...(person.interviewSummary?.points || []),
    ...(person.interviewSummary?.nextWorkIdeas || []),
    person.resume?.label,
    ...(person.topWorkSignals || []).map((signal) => signal.label)
  ].filter(Boolean).join(' ').toLowerCase();
}

function filterPeople(people) {
  const query = (document.getElementById('q').value || '').trim().toLowerCase();
  const status = document.getElementById('status').value;
  const resume = document.getElementById('resume').value;
  const contact = document.getElementById('contact').value;
  const level = document.getElementById('level').value;
  return people.filter((person) => {
    if (status && person.status !== status) return false;
    if (level && String(person.workLevel || '') !== level) return false;
    if (resume === 'link' && !person.resume?.url) return false;
    if (resume === 'status' && !(person.resume?.url || person.resume?.label)) return false;
    if (resume === 'missing' && (person.resume?.url || person.resume?.label)) return false;
    if (contact === 'complete' && !(person.phone && person.email)) return false;
    if (contact === 'missing_phone' && person.phone) return false;
    if (contact === 'missing_email' && person.email) return false;
    if (contact === 'missing_required' && !(person.missingRequiredFields || []).length) return false;
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
    metric('電話', counts.withPhone ?? 0, `缺 ${(counts.total ?? people.length) - (counts.withPhone ?? 0)} 人`),
    metric('Email', counts.withEmail ?? 0, `缺 ${(counts.total ?? people.length) - (counts.withEmail ?? 0)} 人`),
    metric('居住地', counts.withResidence ?? 0, '只顯示縣市/區'),
    metric('缺必要欄位', counts.missingAnyRequired ?? 0, '可用補件表補齊')
  ].join('');

  const levels = [...new Set(people.map((person) => String(person.workLevel || '').trim()).filter(Boolean))].sort();
  const levelSelect = document.getElementById('level');
  levels.forEach((level) => {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = `工作範本 ${level}`;
    levelSelect.appendChild(option);
  });

  const render = () => {
    const filtered = filterPeople(people);
    document.getElementById('peopleGrid').innerHTML = filtered.map(personCard).join('') || '<div class="panel empty" style="grid-column:span 12">沒有符合條件的人才資料。</div>';
  };
  ['q', 'status', 'resume', 'contact', 'level'].forEach((id) => {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });
  render();
}

main().catch((error) => {
  document.getElementById('sourceStatus').textContent = '載入失敗';
  document.getElementById('peopleGrid').innerHTML = `<div class="panel empty" style="grid-column:span 12">載入失敗：${escapeHtml(error.message || String(error))}</div>`;
});
