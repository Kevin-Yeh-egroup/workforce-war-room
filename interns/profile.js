async function loadInterns() {
  const res = await fetch('/data/interns.public.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load interns.public.json');
  return await res.json();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pill(cls, text) {
  return `<span class="pill ${cls || ''}">${escapeHtml(text)}</span>`;
}

function getSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // /interns/<slug>/index.html
  const idx = parts.indexOf('interns');
  if (idx >= 0 && parts.length >= idx + 2) return parts[idx + 1];
  return '';
}

function render(intern) {
  const payCls = intern.payStatusThisMonth === 'paid' ? 'good' : intern.payStatusThisMonth === 'due' ? 'bad' : '';
  return `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap">
      <div>
        <div style="font-size:18px; font-weight:800">${escapeHtml(intern.displayName)}</div>
        <div class="muted" style="font-size:12px; margin-top:4px">slug: ${escapeHtml(intern.slug)}</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        ${pill('', `status: ${intern.status}`)}
        ${pill(payCls, `pay: ${intern.payStatusThisMonth}`)}
        ${pill('', `hours: ${intern.workHoursThisMonth}`)}
        ${pill('', `level: ${intern.workLevel || '—'}`)}
      </div>
    </div>

    <div class="muted" style="font-size:12px; margin-top:14px">資料（公開去識別版）</div>
    <div class="kvs" style="margin-top:10px">
      <div class="k">現職</div><div class="v">${escapeHtml(intern.currentRole || '—')}</div>
      <div class="k">學歷/職業</div><div class="v">${escapeHtml(intern.educationOrJob || '—')}</div>
      <div class="k">目前工作狀態</div><div class="v">${escapeHtml(intern.workStatus || '—')}</div>
      <div class="k">聯繫狀況</div><div class="v">${escapeHtml(intern.contactStatus || '—')}</div>
      <div class="k">介紹人</div><div class="v">${escapeHtml(intern.referrer || '—')}</div>
      <div class="k">備註</div><div class="v">${escapeHtml(intern.notes || '—')}</div>
    </div>
  `;
}

async function main() {
  const metaEl = document.getElementById('meta');
  const cardEl = document.getElementById('card');
  const slug = getSlug();
  try {
    const data = await loadInterns();
    const interns = Array.isArray(data.interns) ? data.interns : [];
    const meta = data.meta || {};
    metaEl.textContent = `generatedAt ${meta.generatedAt || '—'}`;
    const intern = interns.find((x) => x.slug === slug);
    if (!intern) {
      cardEl.innerHTML = `<div class=\"muted\">找不到該工讀生：${escapeHtml(slug)}（請回到索引重新選擇）</div>`;
      return;
    }
    cardEl.innerHTML = render(intern);
    document.title = `工讀生個人頁 - ${intern.displayName}`;
  } catch (e) {
    metaEl.textContent = '載入失敗';
    cardEl.innerHTML = `<div class=\"muted\">載入失敗：${escapeHtml(e?.message || String(e))}</div>`;
  }
}

main();
