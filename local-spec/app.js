const paths = {
  fields: "./fields.json",
  templates: "./templates.json",
  calculations: "./dashboard-calculations.json",
  verification: "./execution-verification.json",
};

const intentMeta = {
  fields: {
    eyebrow: "資料架構",
    title: "每個欄位，都有清楚的歸屬",
    description: "先分清楚工作、事件與人員週容量；覆蓋率等衍生數字只計算，不回寫成主資料。",
  },
  templates: {
    eyebrow: "交付設計",
    title: "一組範本，串起需求與交付",
    description: "工作範本定義目的與門檻，事件範本承接成果、實際耗時與驗收證據。",
  },
  calculations: {
    eyebrow: "管理數字",
    title: "先看分母，才相信百分比",
    description: "每個指標都帶著公式、空值規則與限制；未知資料不會被假裝成 0。",
  },
  verification: {
    eyebrow: "執行證據",
    title: "完成不是狀態，是一條證據鏈",
    description: "用下方開關模擬實際資料；規則先判定狀態，AI 只預檢內容，最後由人員驗收。",
  },
};

const approvalItems = [
  { id: "fields", title: "核准 9 個欄位", detail: "確認名稱、格式、存放位置與必填時機。" },
  { id: "templates", title: "核准 3 組工作／事件範本", detail: "確認能力門檻、P50／P80、交付物與 checklist。" },
  { id: "calculations", title: "核准儀表板計算規格", detail: "確認分母、空值、樣本信心與 72 小時停滯門檻。" },
  { id: "verification", title: "核准 AI 與人工邊界", detail: "AI 只能預檢；不可自動驗收、關閉工作或派薪。" },
];

const APPROVAL_STORAGE_KEY = "workforce-local-spec-approval-v0.1.0";
const APPROVAL_VERSION = "0.1.0";

const app = {
  data: null,
  intent: null,
  templateId: "TOOL_QA",
  approvals: new Set(),
  approvalUpdatedAt: null,
  evidence: {
    assigned: false,
    activity: false,
    deliverable: false,
    submitted: false,
    blocked: false,
    humanApproved: false,
    needsRevision: false,
    stale: false,
  },
};

document.addEventListener("DOMContentLoaded", load);

async function load() {
  bindStaticControls();
  restoreApprovals();
  renderApprovalState();

  try {
    const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path} 讀取失敗（${response.status}）`);
      return [key, await response.json()];
    }));
    app.data = Object.fromEntries(entries);
    assertLocalDraft(app.data);
    renderGlance();
    setSourceState(true, `本地規格已同步 · ${formatTime(new Date())} · 0 外部寫入`);
  } catch (error) {
    setSourceState(false, `本地規格讀取失敗：${error.message}`);
  }
}

function bindStaticControls() {
  document.querySelectorAll("[data-open-intent]").forEach((button) => {
    button.addEventListener("click", () => openIntent(button.dataset.openIntent));
  });
  document.querySelectorAll("[data-intent-tab]").forEach((button) => {
    button.addEventListener("click", () => openIntent(button.dataset.intentTab, false));
  });
  document.querySelector("#backToIntents").addEventListener("click", closeIntent);
  document.querySelector("#reviewChecklist").addEventListener("click", openApprovalDialog);
  document.querySelector("#copyApproval").addEventListener("click", copyApprovalSummary);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== APPROVAL_STORAGE_KEY) return;
    restoreApprovals();
    renderApprovalState();
    if (document.querySelector("#approvalDialog").open) openApprovalDialog();
    showToast("核准進度已從另一個分頁同步");
  });
}

function assertLocalDraft(data) {
  for (const [name, value] of Object.entries(data)) {
    if (value?.meta?.externalWriteApproved !== false) {
      throw new Error(`${name} 未明確標示 externalWriteApproved=false`);
    }
  }
}

function renderGlance() {
  const counts = {
    fieldCount: app.data.fields.fields.length,
    templateCount: app.data.templates.templatePairs.length,
    metricCount: app.data.calculations.metrics.length,
    stateCount: app.data.verification.states.length,
  };
  Object.entries(counts).forEach(([id, value], index) => animateNumber(document.querySelector(`#${id}`), value, index * 80));
}

function openIntent(intent, shouldScroll = true) {
  if (!app.data) {
    showToast("規格仍在載入，請稍候再試");
    return;
  }
  if (!intentMeta[intent]) return;

  const update = () => {
    app.intent = intent;
    const shell = document.querySelector("#focusShell");
    shell.hidden = false;
    shell.classList.remove("is-entering");
    requestAnimationFrame(() => shell.classList.add("is-entering"));
    document.querySelector("#focusEyebrow").textContent = intentMeta[intent].eyebrow;
    document.querySelector("#focusTitle").textContent = intentMeta[intent].title;
    document.querySelector("#focusDescription").textContent = intentMeta[intent].description;
    document.querySelectorAll("[data-intent-tab]").forEach((button) => {
      const selected = button.dataset.intentTab === intent;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    renderIntent(intent);
  };

  update();

  if (shouldScroll) {
    setTimeout(() => document.querySelector("#focusShell").scrollIntoView({ behavior: preferredScroll(), block: "start" }), 40);
  }
}

function closeIntent() {
  const close = () => {
    app.intent = null;
    document.querySelector("#focusShell").hidden = true;
  };
  close();
  document.querySelector("#intentHub").scrollIntoView({ behavior: preferredScroll(), block: "start" });
}

function renderIntent(intent) {
  const renderers = {
    fields: renderFields,
    templates: renderTemplates,
    calculations: renderCalculations,
    verification: renderVerification,
  };
  renderers[intent]();
}

function renderFields() {
  const data = app.data.fields;
  const scopes = [
    { id: "work", label: "工作", note: "需求與派工前條件" },
    { id: "event", label: "事件", note: "單次交付與回報" },
    { id: "person_week", label: "人員 × 週", note: "每週可用容量" },
  ];

  document.querySelector("#focusContent").innerHTML = `
    <div class="scope-map">
      ${scopes.map((scope) => {
        const fields = data.fields.filter((field) => field.scope === scope.id);
        return `<article class="scope-lane">
          <div class="scope-lane-head"><strong>${escapeHtml(scope.label)}</strong><span>${fields.length} 欄</span></div>
          <p class="micro-copy">${escapeHtml(scope.note)}</p>
          <div class="field-chips">
            ${fields.map((field) => `<button class="field-chip" type="button" data-field-id="${escapeHtml(field.id)}">${escapeHtml(field.label)}</button>`).join("")}
          </div>
        </article>`;
      }).join("")}
    </div>
    <div class="derived-strip" aria-label="只計算不回寫的衍生欄位">
      <strong>只計算，不回寫</strong>
      ${data.derivedFields.map((field) => `<span class="derived-pill">${escapeHtml(field.label)}</span>`).join("")}
    </div>
    <div class="level-ribbon" aria-label="能力階段">
      ${data.levelDefinitions.map((level) => `<article class="level-item">
        <strong>${escapeHtml(level.id)}</strong><span>${escapeHtml(level.name)}</span><small>${escapeHtml(level.definition)}</small>
      </article>`).join("")}
    </div>`;

  document.querySelectorAll("[data-field-id]").forEach((button) => {
    button.addEventListener("click", () => openFieldDetail(button.dataset.fieldId));
  });
}

function openFieldDetail(id) {
  const field = app.data.fields.fields.find((item) => item.id === id);
  if (!field) return;
  openDetail({
    eyebrow: `${scopeLabel(field.scope)}欄位 · ${field.id}`,
    title: field.label,
    body: `
      <div class="detail-grid">
        <div class="detail-cell"><span>資料格式</span><strong>${escapeHtml(field.type)}</strong></div>
        <div class="detail-cell"><span>必填時機</span><strong>${escapeHtml(requiredLabel(field.requiredAt))}</strong></div>
        <div class="detail-cell"><span>範例</span><strong>${escapeHtml(formatValue(field.example))}</strong></div>
        <div class="detail-cell"><span>外部寫入</span><strong>尚未核准</strong></div>
      </div>
      <div class="detail-section"><span>建議存放位置</span><p>${escapeHtml(field.storageProposal)}</p></div>
      ${field.options ? `<div class="detail-section"><span>可選值</span><p>${field.options.map(escapeHtml).join(" · ")}</p></div>` : ""}
      ${field.validation ? `<div class="detail-section"><span>驗證規則</span><code class="formula-code">${escapeHtml(JSON.stringify(field.validation))}</code></div>` : ""}`,
  });
}

function renderTemplates() {
  const pairs = app.data.templates.templatePairs;
  const pair = pairs.find((item) => item.id === app.templateId) || pairs[0];
  app.templateId = pair.id;
  const evidence = pair.estimatePolicy.currentEvidence;
  const confidenceWidth = { high: 100, medium: 64, low: 30, baseline: 12 }[evidence.confidence] || 12;

  document.querySelector("#focusContent").innerHTML = `
    <div class="template-switcher" role="group" aria-label="選擇範本">
      ${pairs.map((item) => `<button type="button" data-template-id="${escapeHtml(item.id)}" aria-pressed="${item.id === pair.id}">${escapeHtml(item.name)}</button>`).join("")}
    </div>
    <div class="template-stage">
      <article class="template-node">
        <span class="node-label">Work · 需求定義</span>
        <h3>${escapeHtml(pair.workTemplate.name)}</h3>
        <p>${escapeHtml(pair.workTemplate.purpose)}</p>
        <div class="skill-row"><span>${escapeHtml(pair.workTemplate.minimumLevel)}</span>${pair.workTemplate.requiredSkills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>
      </article>
      <div class="template-arrow" aria-hidden="true">→<small>交付</small></div>
      <article class="template-node event-node">
        <span class="node-label">Event · 成果回報</span>
        <h3>${escapeHtml(pair.eventTemplate.name)}</h3>
        <p>${escapeHtml(pair.workTemplate.doneWhen)}</p>
        <div class="skill-row">${pair.eventTemplate.requiredFields.map((field) => `<span>${escapeHtml(fieldLabel(field))}</span>`).join("")}</div>
      </article>
    </div>
    <div class="evidence-band">
      <div class="estimate-pair">
        <div><span>P50</span><strong>${pair.estimatePolicy.p50Hours}h</strong></div>
        <div><span>P80</span><strong>${pair.estimatePolicy.p80Hours}h</strong></div>
      </div>
      <div class="confidence-meter">
        <span>${confidenceLabel(evidence.confidence)} · ${evidence.sampleCount} 筆實際耗時樣本</span>
        <div class="meter-track" aria-hidden="true"><div class="meter-value" style="width:${confidenceWidth}%"></div></div>
      </div>
      <button type="button" data-template-detail="${escapeHtml(pair.id)}">查看完整交付條件</button>
    </div>`;

  document.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => {
      app.templateId = button.dataset.templateId;
      renderTemplates();
    });
  });
  document.querySelector("[data-template-detail]").addEventListener("click", () => openTemplateDetail(pair));
}

function openTemplateDetail(pair) {
  openDetail({
    eyebrow: `${pair.id} · ${confidenceLabel(pair.estimatePolicy.currentEvidence.confidence)}`,
    title: pair.name,
    body: `
      <div class="detail-grid">
        <div class="detail-cell"><span>能力門檻</span><strong>${escapeHtml(pair.workTemplate.minimumLevel)}</strong></div>
        <div class="detail-cell"><span>預估工時</span><strong>P50 ${pair.estimatePolicy.p50Hours}h · P80 ${pair.estimatePolicy.p80Hours}h</strong></div>
        <div class="detail-cell"><span>樣本來源</span><strong>${escapeHtml(pair.estimatePolicy.source)}</strong></div>
        <div class="detail-cell"><span>有效樣本</span><strong>${pair.estimatePolicy.currentEvidence.sampleCount} 筆</strong></div>
      </div>
      <div class="detail-section"><span>必要輸入</span><ul>${pair.workTemplate.requiredInputs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="detail-section"><span>交付成果</span><ul>${pair.workTemplate.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="detail-section"><span>事件檢查表</span><ul>${pair.eventTemplate.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="detail-section"><span>樣本升級規則</span><p>${escapeHtml(pair.estimatePolicy.promotionRule)}</p></div>`,
  });
}

function renderCalculations() {
  const metrics = app.data.calculations.metrics;
  const spotlightIds = ["assignment_coverage_rate", "estimate_evidence_coverage_rate", "capacity_coverage_rate", "execution_evidence_coverage_rate"];
  const spotlights = spotlightIds.map((id) => metrics.find((metric) => metric.id === id)).filter(Boolean);
  const groups = [
    { title: "工作量", test: (id) => ["active_work_count", "unassigned_count", "in_progress_count", "completed_count", "overdue_count"].includes(id) },
    { title: "容量", test: (id) => ["estimated_demand_p80_hours", "available_capacity_hours", "capacity_gap_hours"].includes(id) },
    { title: "品質與驗收", test: (id) => id.includes("verified") || id.includes("execution") },
  ];

  document.querySelector("#focusContent").innerHTML = `
    <div class="metric-spotlight">
      ${spotlights.map((metric) => `<button class="spotlight-card" type="button" data-metric-id="${metric.id}">
        <strong>${escapeHtml(metric.label)}</strong>
        <span class="formula-visual" aria-label="分子除以分母的公式關係示意，非即時數值"><i></i><i></i></span>
        <small>分子 ÷ 分母 · 查看定義</small>
      </button>`).join("")}
    </div>
    <div class="metric-groups">
      ${groups.map((group) => {
        const items = metrics.filter((metric) => group.test(metric.id) && !spotlightIds.includes(metric.id));
        return `<section class="metric-group"><h3>${escapeHtml(group.title)}</h3><div class="metric-list">
          ${items.map((metric) => `<button type="button" data-metric-id="${metric.id}"><span>${escapeHtml(metric.label)}</span><span>公式 ↗</span></button>`).join("")}
        </div></section>`;
      }).join("")}
    </div>`;

  document.querySelectorAll("[data-metric-id]").forEach((button) => {
    button.addEventListener("click", () => openMetricDetail(button.dataset.metricId));
  });
}

function openMetricDetail(id) {
  const metric = app.data.calculations.metrics.find((item) => item.id === id);
  if (!metric) return;
  openDetail({
    eyebrow: `計算規格 · ${metric.id}`,
    title: metric.label,
    body: `
      <code class="formula-code">${escapeHtml(metric.formula)}</code>
      <div class="detail-grid" style="margin-top:12px">
        <div class="detail-cell"><span>分子</span><strong>${escapeHtml(metric.numerator || "不適用")}</strong></div>
        <div class="detail-cell"><span>分母</span><strong>${escapeHtml(metric.denominator || "不適用")}</strong></div>
        <div class="detail-cell"><span>空值顯示</span><strong>${metric.emptyState === null ? "待確認／待接" : escapeHtml(metric.emptyState)}</strong></div>
        <div class="detail-cell"><span>外部回寫</span><strong>不回寫</strong></div>
      </div>
      ${metric.caveat ? `<div class="detail-section"><span>判讀限制</span><p>${escapeHtml(metric.caveat)}</p></div>` : ""}
      ${metric.interpretation ? `<div class="detail-section"><span>如何解讀</span><p>${escapeHtml(metric.interpretation)}</p></div>` : ""}`,
  });
}

function renderVerification() {
  document.querySelector("#focusContent").innerHTML = `
    <div class="verification-studio">
      <section class="evidence-console">
        <h3>證據模擬器</h3>
        <p>切換目前可讀到的 InfoCenter 訊號</p>
        <div class="evidence-toggles">
          ${[
            ["assigned", "已指派人員"],
            ["activity", "指派後有事件／評論活動"],
            ["deliverable", "已有成果連結或附件"],
            ["submitted", "事件已送審"],
            ["blocked", "有明確卡關訊號"],
            ["humanApproved", "人員已核准交付"],
            ["needsRevision", "人工要求補件／修正"],
            ["stale", "超過 72 小時沒有新證據"],
          ].map(([id, label]) => `<label class="evidence-toggle"><input type="checkbox" data-evidence="${id}" ${app.evidence[id] ? "checked" : ""}><span class="toggle-mark" aria-hidden="true"></span><span>${label}</span></label>`).join("")}
        </div>
      </section>
      <section class="result-stage" id="resultStage" aria-live="polite"></section>
    </div>
    <div class="state-rail" aria-label="所有可能的證據狀態">
      ${app.data.verification.states.map((state) => `<button type="button" data-state-id="${state.id}">${escapeHtml(state.label)}</button>`).join("")}
    </div>
    <div class="ai-boundary">
      <div><strong>AI 可以找缺件，不能替你驗收</strong><p>不會自動宣告完成、關閉工作、建立薪資或派薪。</p></div>
      <button class="text-button" type="button" id="aiBoundaryDetail">查看 AI 邊界</button>
    </div>`;

  document.querySelectorAll("[data-evidence]").forEach((input) => {
    input.addEventListener("change", () => {
      app.evidence[input.dataset.evidence] = input.checked;
      normalizeEvidenceDependencies(input.dataset.evidence, input.checked);
      syncEvidenceControls();
      renderEvidenceResult();
    });
  });
  document.querySelectorAll("[data-state-id]").forEach((button) => {
    button.addEventListener("click", () => openStateDetail(button.dataset.stateId));
  });
  document.querySelector("#aiBoundaryDetail").addEventListener("click", openAiBoundary);
  renderEvidenceResult();
}

function normalizeEvidenceDependencies(changedId, checked) {
  const evidence = app.evidence;
  const autoCompleted = [];
  const enable = (id) => {
    if (!evidence[id]) autoCompleted.push(id);
    evidence[id] = true;
  };

  if (checked) {
    if (["activity", "deliverable", "submitted", "blocked", "stale"].includes(changedId)) enable("assigned");
    if (changedId === "deliverable") enable("activity");
    if (changedId === "submitted") enable("activity");
    if (changedId === "humanApproved") {
      ["assigned", "activity", "deliverable", "submitted"].forEach(enable);
      evidence.needsRevision = false;
    }
    if (changedId === "needsRevision") {
      ["assigned", "activity", "submitted"].forEach(enable);
      evidence.humanApproved = false;
    }
  }

  if (!evidence.assigned) {
    ["activity", "deliverable", "submitted", "blocked", "humanApproved", "needsRevision", "stale"].forEach((id) => {
      evidence[id] = false;
    });
  }
  if (!evidence.submitted) {
    evidence.humanApproved = false;
    evidence.needsRevision = false;
  }

  if (autoCompleted.length) showToast(`已自動補齊 ${autoCompleted.length} 個必要前置訊號`);
}

function syncEvidenceControls() {
  document.querySelectorAll("[data-evidence]").forEach((input) => {
    input.checked = Boolean(app.evidence[input.dataset.evidence]);
  });
}

function deriveEvidenceState() {
  const evidence = app.evidence;
  if (evidence.blocked) return "blocked";
  if (evidence.assigned && evidence.submitted && evidence.deliverable && evidence.humanApproved) return "human_verified";
  if (evidence.assigned && evidence.submitted && evidence.needsRevision) return "needs_revision";
  if (evidence.submitted && !evidence.deliverable) return "submitted_missing_evidence";
  if (evidence.submitted && evidence.deliverable) return "submitted";
  if (evidence.assigned && evidence.stale) return "stale";
  if (evidence.assigned && evidence.activity) return "started";
  if (evidence.assigned) return "assigned_no_evidence";
  return "not_assigned";
}

function renderEvidenceResult() {
  const stateId = deriveEvidenceState();
  const state = app.data.verification.states.find((item) => item.id === stateId);
  if (!state) return;
  const aiReady = state.aiNeeded && app.evidence.deliverable && app.evidence.submitted;
  const colors = { blocked: "#f0c7bc", human_verified: "#cce4d9", needs_revision: "#f4d6a8", submitted: "#d9e28f", submitted_missing_evidence: "#f4d6a8", stale: "#f6e1ba", started: "#c9deda", assigned_no_evidence: "#e3e3d8", not_assigned: "#e8e7e0" };
  const stage = document.querySelector("#resultStage");
  stage.style.setProperty("--result-color", colors[stateId] || "#dcebe5");
  stage.innerHTML = `
    <span class="result-kicker">規則判定</span>
    <h3 class="result-state">${escapeHtml(state.label)}</h3>
    <p class="result-rule">${escapeHtml(state.deterministicRule)}</p>
    <div class="result-next"><span>下一個管理動作</span><strong>${escapeHtml(state.nextAction)}</strong></div>
    <span class="ai-gate ${aiReady ? "is-ready" : ""}">${aiReady ? "AI 預檢條件已成立" : state.aiNeeded ? app.evidence.submitted ? "需先補齊交付物" : "需先補齊交付物與送審訊號" : "目前不需要啟動 AI"}</span>`;
  document.querySelectorAll("[data-state-id]").forEach((button) => button.classList.toggle("is-current", button.dataset.stateId === stateId));
}

function openStateDetail(id) {
  const state = app.data.verification.states.find((item) => item.id === id);
  if (!state) return;
  openDetail({
    eyebrow: `執行狀態 · ${state.id}`,
    title: state.label,
    body: `
      <div class="detail-section"><span>確定性規則</span><code class="formula-code">${escapeHtml(state.deterministicRule)}</code></div>
      <div class="detail-section"><span>下一步</span><p>${escapeHtml(state.nextAction)}</p></div>
      <div class="detail-section"><span>是否需要 AI</span><p>${state.aiNeeded ? "可在有交付物時啟動內容預檢；仍需人工決定。" : "不需要；可由資料規則直接辨識。"}</p></div>`,
  });
}

function openAiBoundary() {
  const review = app.data.verification.aiReview;
  openDetail({
    eyebrow: "AI 預檢 · 人工核准必須",
    title: "AI 可以做與不能做的事",
    body: `
      <div class="detail-section"><span>啟動條件</span><p>${escapeHtml(review.runsOnlyWhen)}</p></div>
      <div class="detail-section"><span>可做</span><ul>${review.tasks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="detail-section"><span>不可做</span><ul>${review.mustNotDo.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`,
  });
}

function openDetail({ eyebrow, title, body }) {
  const dialog = document.querySelector("#detailDialog");
  document.querySelector("#dialogEyebrow").textContent = eyebrow;
  document.querySelector("#dialogTitle").textContent = title;
  document.querySelector("#dialogBody").innerHTML = body;
  dialog.showModal();
}

function openApprovalDialog() {
  const container = document.querySelector("#approvalChecks");
  container.innerHTML = approvalItems.map((item) => `
    <label class="approval-check">
      <input type="checkbox" data-approval-id="${item.id}" ${app.approvals.has(item.id) ? "checked" : ""}>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span>
    </label>`).join("");
  container.querySelectorAll("[data-approval-id]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) app.approvals.add(input.dataset.approvalId);
      else app.approvals.delete(input.dataset.approvalId);
      persistApprovals();
      renderApprovalState();
    });
  });
  const dialog = document.querySelector("#approvalDialog");
  if (!dialog.open) dialog.showModal();
}

function restoreApprovals() {
  try {
    const saved = JSON.parse(localStorage.getItem(APPROVAL_STORAGE_KEY) || "null");
    const checked = Array.isArray(saved) ? saved : saved?.checked;
    app.approvals = new Set((Array.isArray(checked) ? checked : []).filter((id) => approvalItems.some((item) => item.id === id)));
    app.approvalUpdatedAt = app.approvals.size && !Array.isArray(saved) ? saved?.updatedAt || null : null;
  } catch {
    app.approvals = new Set();
    app.approvalUpdatedAt = null;
  }
}

function persistApprovals() {
  if (app.approvals.size === 0) {
    app.approvalUpdatedAt = null;
    localStorage.removeItem(APPROVAL_STORAGE_KEY);
    return;
  }
  app.approvalUpdatedAt = new Date().toISOString();
  localStorage.setItem(APPROVAL_STORAGE_KEY, JSON.stringify({
    version: APPROVAL_VERSION,
    checked: [...app.approvals],
    updatedAt: app.approvalUpdatedAt,
  }));
}

function renderApprovalState() {
  const count = app.approvals.size;
  document.querySelector("#approvalCount").textContent = `${count}/4`;
  document.querySelector("#decisionCount").textContent = String(4 - count);
  document.querySelector("#approvalRing").style.strokeDashoffset = String(239 - (239 * count / 4));
  const meta = document.querySelector("#approvalMeta");
  if (meta) {
    meta.textContent = app.approvalUpdatedAt
      ? `規格 v${APPROVAL_VERSION} · 更新於 ${formatDateTime(app.approvalUpdatedAt)} · 同瀏覽器同步`
      : `規格 v${APPROVAL_VERSION} · 尚未確認`;
  }
}

async function copyApprovalSummary() {
  if (!app.data) {
    showToast("規格仍在載入");
    return;
  }
  const lines = [
    "# InfoCenter 工讀生管理核准摘要",
    `- 規格版本：${APPROVAL_VERSION}`,
    `- 核准更新：${app.approvalUpdatedAt ? formatDateTime(app.approvalUpdatedAt) : "尚未確認"}`,
    ...approvalItems.map((item) => `- [${app.approvals.has(item.id) ? "x" : " "}] ${item.title}`),
    "- [ ] 先建立 1 組範本與 1 筆測試工作，讀回驗證後再批次建立",
    "- [ ] AI 僅做內容預檢，不自動驗收、關閉工作、建立薪資或派薪",
    "",
    "目前狀態：externalWriteApproved=false；尚未寫入 InfoCenter。",
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("核准摘要已複製");
  } catch {
    showToast("剪貼簿不可用，請開啟核准清單查看");
  }
}

function setSourceState(ready, message) {
  const target = document.querySelector("#sourceState");
  target.classList.toggle("is-ready", ready);
  target.classList.toggle("is-error", !ready);
  target.querySelector("span:last-child").textContent = message;
}

function animateNumber(element, target, delay) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) { element.textContent = target; return; }
  setTimeout(() => {
    const start = performance.now();
    const duration = 430;
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(target * eased);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, delay);
}

function preferredScroll() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scopeLabel(scope) {
  return { work: "工作", event: "事件", person_week: "人員 × 週" }[scope] || scope;
}

function requiredLabel(value) {
  return {
    before_assignment: "派工前",
    weekly_capacity_refresh: "每週容量更新",
    before_submission: "送審前",
    when_blocked: "卡關時",
  }[value] || value;
}

function fieldLabel(id) {
  return app.data.fields.fields.find((field) => field.id === id)?.label || id;
}

function confidenceLabel(value) {
  return { high: "高信心", medium: "中信心", low: "低信心", baseline: "基準值" }[value] || value;
}

function formatValue(value) {
  return Array.isArray(value) ? value.join("、") : String(value ?? "—");
}

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "時間不明";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
