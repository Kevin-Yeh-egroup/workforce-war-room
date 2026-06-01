const DEFAULT_WEEK = "../data/radar-week.json";
const DEFAULT_TRACKING = "../data/radar-tracking.json";

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

const state = {
  view: "highlights",
  weekPath: getParam("week") || DEFAULT_WEEK,
  trackingPath: getParam("tracking") || DEFAULT_TRACKING,
  week: null,
  tracking: null,
  items: [],
};

const els = {
  meta: document.getElementById("meta"),
  view: document.getElementById("view"),
  q: document.getElementById("q"),
  topic: document.getElementById("topic"),
  status: document.getElementById("status"),
  cred: document.getElementById("cred"),
  reset: document.getElementById("reset"),
  reload: document.getElementById("reload"),
  countPill: document.getElementById("countPill"),
  sourcePill: document.getElementById("sourcePill"),
  paths: document.getElementById("paths"),
};

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function topicLabel(t) {
  return (
    {
      tw_social_work: "台灣社工環境",
      tw_fin_ed: "台灣財務教育",
      global_ai: "全球 AI（可轉用）",
      codex_workflow: "Codex/自動化（可轉用）",
      growth_gamification: "會員/成長案例（可轉用）",
    }[t] || t || "—"
  );
}

function credibilityPill(item) {
  const level = item?.credibility?.level || "";
  if (!level) return `<span class="pill">cred: —</span>`;
  const cls = level === "high" ? "good" : level === "low" ? "bad" : "";
  return `<span class="pill ${cls}">cred: ${escapeHtml(level)}</span>`;
}

function applyFilters(items) {
  const q = els.q.value.trim().toLowerCase();
  const topic = els.topic.value;
  const status = els.status.value;
  const cred = els.cred.value;

  return items.filter((it) => {
    if (topic && it.topic !== topic) return false;
    if (status && it.status !== status) return false;
    if (cred && (it.credibility?.level || "") !== cred) return false;
    if (!q) return true;
    const hay = [
      it.title,
      it.oneLine,
      ...(it.tags || []),
      ...(it.facts || []),
      ...(it.yourTake || []),
      ...(it.actions || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function renderHighlights() {
  const w = state.week;
  const hs = w?.highlights || [];
  const list = hs.length
    ? hs
        .map(
          (h, idx) => `
          <div class="card item">
            <h3>${idx + 1}. ${escapeHtml(h.title || "（未命名）")}</h3>
            <div class="sub">
              <span class="pill">${escapeHtml(w?.meta?.weekStart || "—")}～${escapeHtml(
            w?.meta?.weekEnd || "—"
          )}</span>
            </div>
            <ul>
              <li><strong>why</strong>：${escapeHtml(h.why || "—")}</li>
              <li><strong>next</strong>：${escapeHtml(h.next || "—")}</li>
            </ul>
          </div>`
        )
        .join("")
    : `<div class="muted">此週沒有 highlights。請在 data/radar-week.json 的 highlights[] 填入。</div>`;

  els.view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <div>
        <div class="pill">view: 精選</div>
      </div>
    </div>
    ${list}
  `;
}

function renderLibrary() {
  const items = applyFilters(state.items);
  els.countPill.textContent = `${items.length} items`;
  const list = items.length
    ? items
        .map((it) => {
          const src = (it.sources || [])[0];
          const srcLink = src?.url
            ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noreferrer">${escapeHtml(
                src.label || "來源"
              )}</a>`
            : `<span class="muted">（無連結）</span>`;
          const extraSources = (it.sources || []).slice(1);
          const extra =
            extraSources.length > 0
              ? `<div class="sub">其他來源：${extraSources
                  .map((s) => (s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.label || s.url)}</a>` : escapeHtml(s.label || "")))
                  .join(" · ")}</div>`
              : "";

          const facts = (it.facts || []).slice(0, 6).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
          const take = (it.yourTake || []).slice(0, 4).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
          const act = (it.actions || []).slice(0, 4).map((x) => `<li>${escapeHtml(x)}</li>`).join("");

          return `
            <div class="card item">
              <h3>${escapeHtml(it.title || "（未命名）")}</h3>
              <div class="sub">
                <span class="pill">${escapeHtml(it.date || "—")}</span>
                <span class="pill">${escapeHtml(topicLabel(it.topic))}</span>
                <span class="pill">status: ${escapeHtml(it.status || "—")}</span>
                ${credibilityPill(it)}
                <span class="pill">id: ${escapeHtml(it.id || "—")}</span>
              </div>
              <div style="margin-top:8px">${escapeHtml(it.oneLine || "")}</div>
              <ul style="margin-top:10px">
                <li><strong>事實</strong><ul>${facts || "<li>—</li>"}</ul></li>
                <li><strong>趨勢判讀</strong><ul>${take || "<li>—</li>"}</ul></li>
                <li><strong>可行動</strong><ul>${act || "<li>—</li>"}</ul></li>
              </ul>
              <div class="sub" style="margin-top:10px">主來源：${srcLink}</div>
              ${extra}
              ${
                (it.followups || []).length
                  ? `<div class="sub" style="margin-top:8px">待追：${it.followups.map(escapeHtml).join("；")}</div>`
                  : ""
              }
            </div>
          `;
        })
        .join("")
    : `<div class="muted">沒有符合條件的條目。</div>`;

  els.view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <div class="pill">view: 條目庫</div>
      <div class="muted" style="font-size:12px">提示：用左側篩選縮小範圍，再到「匯出」一鍵轉 Markdown。</div>
    </div>
    <div class="list">${list}</div>
  `;
}

function renderTracking() {
  const t = state.tracking?.items || [];
  const open = t.filter((x) => x.status === "open" || x.status === "blocked");
  const done = t.filter((x) => x.status === "done");

  const block = (arr, title) => `
    <div class="card">
      <div class="row">
        <div class="pill">${escapeHtml(title)}</div>
        <div class="pill">${arr.length} items</div>
      </div>
      <div class="list" style="margin-top:10px">
        ${
          arr.length
            ? arr
                .map(
                  (x) => `
                  <div class="card item" style="margin:0">
                    <h3>${escapeHtml(x.title || "（未命名）")}</h3>
                    <div class="sub">
                      <span class="pill">status: ${escapeHtml(x.status || "—")}</span>
                      <span class="pill">nextCheck: ${escapeHtml(x.nextCheck || "—")}</span>
                      ${x.topic ? `<span class="pill">${escapeHtml(topicLabel(x.topic))}</span>` : ""}
                      <span class="pill">id: ${escapeHtml(x.id || "—")}</span>
                    </div>
                    ${x.question ? `<div style="margin-top:8px"><strong>要追的問題</strong>：${escapeHtml(x.question)}</div>` : ""}
                    ${
                      (x.links || []).length
                        ? `<div class="sub" style="margin-top:8px">links：${x.links
                            .map((l) => `<a href="${escapeHtml(l)}" target="_blank" rel="noreferrer">${escapeHtml(l)}</a>`)
                            .join(" · ")}</div>`
                        : ""
                    }
                  </div>`
                )
                .join("")
            : `<div class="muted">（無）</div>`
        }
      </div>
    </div>
  `;

  els.view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <div class="pill">view: 追蹤</div>
      <div class="muted" style="font-size:12px">編輯 data/radar-tracking.json 後按「重新載入資料」。</div>
    </div>
    ${block(open, "Open/Blocked")}
    ${block(done, "Done")}
  `;
}

function renderExport() {
  const items = applyFilters(state.items);
  const meta = state.week?.meta || {};
  const title = `每週資訊雷達（${meta.weekStart || "—"}～${meta.weekEnd || "—"}）`;
  const md = [
    `# ${title}`,
    ``,
    `> generatedAt: ${meta.generatedAt || "—"} | timezone: ${meta.timezone || "—"}`,
    ``,
    `## 篩選條件`,
    `- q: ${els.q.value || "（空）"}`,
    `- topic: ${els.topic.value || "（全部）"}`,
    `- status: ${els.status.value || "（全部）"}`,
    `- credibility: ${els.cred.value || "（全部）"}`,
    ``,
    `---`,
    ``,
    `## 條目（${items.length}）`,
    ``,
    ...items.flatMap((it) => {
      const src = (it.sources || [])[0] || {};
      return [
        `### ${it.date || "—"}｜${it.title || "（未命名）"}`,
        `- 主題：${topicLabel(it.topic)}`,
        `- 一句話：${it.oneLine || "—"}`,
        `- 事實：${(it.facts || []).map((x) => `\n  - ${x}`).join("") || "\n  - —"}`,
        `- 趨勢判讀：${(it.yourTake || []).map((x) => `\n  - ${x}`).join("") || "\n  - —"}`,
        `- 可行動：${(it.actions || []).map((x) => `\n  - ${x}`).join("") || "\n  - —"}`,
        `- 來源：${src.url ? `${src.label || "來源"} ${src.url}` : (src.label || "—")}`,
        ``,
      ];
    }),
  ].join("\n");

  els.view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <div class="pill">view: 匯出</div>
      <button class="btn primary" id="copyMd" style="width:auto">複製 Markdown</button>
    </div>
    <div class="muted" style="font-size:12px;margin-bottom:8px">匯出內容＝目前左側篩選條件下的條目。</div>
    <pre id="md">${escapeHtml(md)}</pre>
  `;

  document.getElementById("copyMd").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(md);
      alert("已複製到剪貼簿");
    } catch {
      alert("複製失敗（瀏覽器限制）。請手動全選複製。");
    }
  });
}

function render() {
  const v = state.view;
  if (v === "highlights") renderHighlights();
  else if (v === "library") renderLibrary();
  else if (v === "tracking") renderTracking();
  else if (v === "export") renderExport();
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

async function reload() {
  els.meta.textContent = "載入中…";
  els.paths.textContent = `week: ${state.weekPath}\ntracking: ${state.trackingPath}`;
  try {
    const [week, tracking] = await Promise.all([loadJson(state.weekPath), loadJson(state.trackingPath)]);
    state.week = week;
    state.tracking = tracking;
    state.items = Array.isArray(week?.items) ? week.items : [];
    const meta = week?.meta || {};
    els.meta.textContent = `week ${meta.weekStart || "—"}～${meta.weekEnd || "—"} · generatedAt ${meta.generatedAt || "—"}`;
    els.sourcePill.textContent = `week: ${meta.weekStart || "—"}～${meta.weekEnd || "—"}`;
    els.countPill.textContent = `${state.items.length} items`;
    render();
  } catch (e) {
    els.meta.textContent = "載入失敗";
    els.view.innerHTML = `<div class="muted">載入失敗：${escapeHtml(e?.message || String(e))}</div>`;
  }
}

function wireUi() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.view = btn.dataset.view;
      render();
    });
  });

  const onFilterChange = () => {
    if (state.view === "library" || state.view === "export") render();
    else {
      const items = applyFilters(state.items);
      els.countPill.textContent = `${items.length} items`;
    }
  };
  ["input", "change"].forEach((evt) => {
    els.q.addEventListener(evt, onFilterChange);
    els.topic.addEventListener(evt, onFilterChange);
    els.status.addEventListener(evt, onFilterChange);
    els.cred.addEventListener(evt, onFilterChange);
  });

  els.reset.addEventListener("click", () => {
    els.q.value = "";
    els.topic.value = "";
    els.status.value = "";
    els.cred.value = "";
    render();
  });

  els.reload.addEventListener("click", reload);
}

wireUi();
reload();

