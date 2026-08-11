async function loadTalentPool() {
  const response = await fetch('/data/talent-pool.public.json', { cache: 'no-store' });
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

function metric(label, value, hint) {
  return `<article class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></article>`;
}

function badge(value) {
  const cls = value === 'active' ? 'green' : value === 'paused' ? 'red' : 'blue';
  return `<span class="badge ${cls}">${escapeHtml(value)}</span>`;
}

function personCard(person) {
  return `<article class="card person-card">
    <div class="person-head">
      <div>
        <h3>${escapeHtml(person.displayName || '匿名成員')}</h3>
        <div class="person-role">公開識別碼：${escapeHtml(person.slug)}</div>
      </div>
      <div class="badges">${badge(person.status || 'unknown')}</div>
    </div>
    <div class="kv compact-kv">
      <div class="k">工作層級</div><div class="v">${escapeHtml(person.workLevel || '未公開')}</div>
      <div class="k">資料範圍</div><div class="v">不含姓名、聯絡方式、居住地、備註、工時與薪資狀態</div>
    </div>
    <div class="toolbar" style="justify-content:flex-start">
      <a class="tool primary" href="/talent-pool/${encodeURIComponent(person.slug)}/index.html">查看公開資料</a>
    </div>
  </article>`;
}

async function main() {
  const data = await loadTalentPool();
  const people = Array.isArray(data.people) ? data.people : [];
  const counts = data.meta?.counts || {};
  document.getElementById('sourceStatus').textContent = `公開安全版更新：${data.meta?.generatedAt || '未知'}`;
  document.getElementById('metrics').innerHTML = [
    metric('匿名成員', counts.total ?? people.length, '僅顯示公開別名'),
    metric('進行中', counts.active ?? 0, 'aggregate'),
    metric('暫停', counts.paused ?? 0, 'aggregate'),
  ].join('');

  const status = document.getElementById('status');
  const q = document.getElementById('q');
  const level = document.getElementById('level');
  [...new Set(people.map((person) => person.workLevel).filter(Boolean))].sort().forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    level.appendChild(option);
  });

  const render = () => {
    const query = q.value.trim().toLowerCase();
    const filtered = people.filter((person) => {
      if (status.value && person.status !== status.value) return false;
      if (level.value && person.workLevel !== level.value) return false;
      return !query || [person.displayName, person.slug].some((value) => String(value || '').toLowerCase().includes(query));
    });
    document.getElementById('peopleGrid').innerHTML = filtered.map(personCard).join('') || '<div class="panel empty" style="grid-column:span 12">沒有符合的公開資料。</div>';
  };
  [status, q, level].forEach((element) => {
    element.addEventListener('input', render);
    element.addEventListener('change', render);
  });
  render();
}

main().catch((error) => {
  document.getElementById('sourceStatus').textContent = '公開資料讀取失敗';
  document.getElementById('peopleGrid').innerHTML = `<div class="panel empty" style="grid-column:span 12">讀取失敗：${escapeHtml(error.message || error)}</div>`;
});
