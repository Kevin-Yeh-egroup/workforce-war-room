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

function renderCard(intern) {
  const payCls = intern.payStatusThisMonth === 'paid' ? 'good' : intern.payStatusThisMonth === 'due' ? 'bad' : '';
  return `
    <div class="card" style="padding:14px">
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap">
        <div>
          <div style="font-size:14px; font-weight:700">${escapeHtml(intern.displayName)}</div>
          <div class="muted" style="font-size:12px; margin-top:2px">slug: ${escapeHtml(intern.slug)}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          ${pill('', `status: ${intern.status}`)}
          ${pill(payCls, `pay: ${intern.payStatusThisMonth}`)}
          ${pill('', `hours: ${intern.workHoursThisMonth}`)}
        </div>
      </div>
      <div class="muted" style="font-size:12px; margin-top:10px">重點</div>
      <div class="kvs" style="margin-top:8px">
        <div class="k">現職</div><div class="v">${escapeHtml(intern.currentRole || '—')}</div>
        <div class="k">學歷/職業</div><div class="v">${escapeHtml(intern.educationOrJob || '—')}</div>
        <div class="k">目前工作狀態</div><div class="v">${escapeHtml(intern.workStatus || '—')}</div>
        <div class="k">工作等級</div><div class="v">${escapeHtml(intern.workLevel || '—')}</div>
        <div class="k">備註</div><div class="v">${escapeHtml(intern.notes || '—')}</div>
      </div>
      <div style="margin-top:12px">
        <a class="pill" href="/interns/${encodeURIComponent(intern.slug)}/index.html">打開個人頁</a>
      </div>
    </div>
  `;
}

function applyFilters(interns) {
  const q = (document.getElementById('q').value || '').trim().toLowerCase();
  const status = document.getElementById('status').value;
  const pay = document.getElementById('pay').value;
  return interns.filter((it) => {
    if (status && it.status !== status) return false;
    if (pay && it.payStatusThisMonth !== pay) return false;
    if (!q) return true;
    const hay = [it.displayName, it.notes, it.currentRole, it.educationOrJob, it.workStatus, it.workLevel, it.referrer]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

async function main() {
  const metaEl = document.getElementById('meta');
  const listEl = document.getElementById('list');
  try {
    const data = await loadInterns();
    const interns = Array.isArray(data.interns) ? data.interns : [];
    const meta = data.meta || {};
    metaEl.textContent = `generatedAt ${meta.generatedAt || '—'} · total ${meta.counts?.total ?? interns.length}`;

    const rerender = () => {
      const items = applyFilters(interns);
      listEl.innerHTML = items.map(renderCard).join('') || `<div class="muted">沒有符合條件的項目。</div>`;
    };
    ['q', 'status', 'pay'].forEach((id) => {
      document.getElementById(id).addEventListener('input', rerender);
      document.getElementById(id).addEventListener('change', rerender);
    });
    rerender();
  } catch (e) {
    metaEl.textContent = '載入失敗';
    listEl.innerHTML = `<div class="muted">載入失敗：${escapeHtml(e?.message || String(e))}</div>`;
  }
}

main();
