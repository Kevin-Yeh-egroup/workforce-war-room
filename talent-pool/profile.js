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

function getSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[1] : '';
}

function render(person, meta) {
  const displayName = person.displayName || '匿名成員';
  const maskedEmail = person.maskedEmail || 'Email 未提供';
  document.title = `${displayName}｜公開人才資料`;
  document.getElementById('title').textContent = displayName;
  document.getElementById('sourceStatus').textContent = `公開安全版更新：${meta?.generatedAt || '未知'}`;
  document.getElementById('profileCard').innerHTML = `
    <section class="section-card">
      <div class="person-name-line"><h2>${escapeHtml(displayName)}</h2><span>${escapeHtml(maskedEmail)}</span></div>
      <div class="kv">
        <div class="k">公開識別碼</div><div class="v">${escapeHtml(person.slug)}</div>
        <div class="k">狀態</div><div class="v">${escapeHtml(person.status || 'unknown')}</div>
        <div class="k">工作層級</div><div class="v">${escapeHtml(person.workLevel || '未公開')}</div>
        <div class="k">隱私範圍</div><div class="v">姓名與 Email 均已遮罩；電話、完整 Email、居住地、備註、面談內容、工時與薪資狀態均未公開。</div>
      </div>
    </section>`;
}

async function main() {
  const data = await loadTalentPool();
  const person = (data.people || []).find((item) => item.slug === getSlug());
  if (!person) throw new Error('找不到此匿名成員');
  render(person, data.meta);
}

main().catch((error) => {
  document.getElementById('sourceStatus').textContent = '公開資料讀取失敗';
  document.getElementById('profileCard').innerHTML = `<section class="section-card">${escapeHtml(error.message || error)}</section>`;
});
