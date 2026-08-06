const DATA_PATHS = {
  interns: "./data/interns.public.json",
  radar: "./data/radar-week.json",
  tracking: "./data/radar-tracking.json",
  workItems: "./data/radar-work-items.md",
  workSummary: "./data/infocenter-work-summary.json",
  rhythm: "./data/work-rhythm.internal.json",
  blueprint: "./data/work-blueprint.json",
};

const state = {
  currentView: "overview",
  taskFilter: "active",
  peopleSearch: "",
  peopleStatus: "all",
  datasets: {},
  tasks: [],
  recommendations: [],
  sources: [],
  errors: [],
};

const numberFormat = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindControls();
  loadDashboard();
});

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 讀取失敗（${response.status}）`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 讀取失敗（${response.status}）`);
  return response.text();
}

async function loadDashboard() {
  setLoadingState();
  state.errors = [];

  const loaders = {
    interns: fetchJson(DATA_PATHS.interns),
    radar: fetchJson(DATA_PATHS.radar),
    tracking: fetchJson(DATA_PATHS.tracking),
    workItems: fetchText(DATA_PATHS.workItems),
    workSummary: fetchJson(DATA_PATHS.workSummary),
    rhythm: fetchJson(DATA_PATHS.rhythm),
    blueprint: fetchJson(DATA_PATHS.blueprint),
  };

  const entries = Object.entries(loaders);
  const results = await Promise.allSettled(entries.map(([, promise]) => promise));

  results.forEach((result, index) => {
    const key = entries[index][0];
    if (result.status === "fulfilled") {
      state.datasets[key] = result.value;
    } else {
      state.datasets[key] = null;
      state.errors.push(result.reason?.message || `${key} 讀取失敗`);
    }
  });

  state.tasks = normalizeInfoCenterWorkItems(state.datasets.workSummary)
    || parseWorkItems(state.datasets.workItems || "");
  state.sources = buildSourceStates();
  state.recommendations = buildRecommendations();
  renderAll();
}

function setLoadingState() {
  const strip = document.querySelector("#sourceStrip");
  strip.className = "source-strip";
  strip.innerHTML = '<span class="source-pulse" aria-hidden="true"></span><span>正在讀取資料來源…</span>';
  document.querySelector("#reloadButton").disabled = true;
}

function renderAll() {
  renderSourceStrip();
  renderMetrics();
  renderCoverage();
  renderPriorityBanner();
  renderWorkflow("#overviewWorkflow", false);
  renderWorkflow("#blueprintWorkflow", true);
  renderSourceList();
  renderTasks();
  renderPeopleSnapshot();
  renderPeopleSummary();
  renderPeopleGrid();
  renderDomains();
  renderRecommendations();
  updateNavigationCounts();
  updateFooter();
  document.querySelector("#reloadButton").disabled = false;
}

function bindNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-go-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.goView));
  });

  const requestedView = window.location.hash.replace("#", "");
  if (["overview", "dispatch", "people", "blueprint", "recommendations"].includes(requestedView)) {
    showView(requestedView, false);
  }
}

function bindControls() {
  document.querySelector("#reloadButton").addEventListener("click", loadDashboard);
  document.querySelector("#copyBriefButton").addEventListener("click", copyManagementBrief);
  document.querySelector("#copyRecommendationButton").addEventListener("click", copyRecommendationList);

  document.querySelectorAll("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.taskFilter = button.dataset.taskFilter;
      document.querySelectorAll("[data-task-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderTasks();
    });
  });

  document.querySelector("#peopleSearch").addEventListener("input", (event) => {
    state.peopleSearch = event.target.value.trim().toLowerCase();
    renderPeopleGrid();
  });

  document.querySelector("#peopleStatusFilter").addEventListener("change", (event) => {
    state.peopleStatus = event.target.value;
    renderPeopleGrid();
  });
}

function showView(view, updateHash = true) {
  state.currentView = view;

  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.toggle("is-hidden", section.id !== view);
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  if (updateHash) history.replaceState(null, "", `#${view}`);
  document.querySelector("#mainContent").scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizeInfoCenterWorkItems(summary) {
  if (!Array.isArray(summary?.workItems)) return null;
  return summary.workItems.map((item) => ({
    id: item.id,
    title: item.label || item.categoryName || "匿名工作",
    source: "infocenter",
    done: ["completed", "cancelled"].includes(item.status),
    statusKey: item.status,
    status: item.statusLabel || "待確認",
    stage: item.stage || "待確認",
    owner: item.assignedCount > 0 ? `${item.assignedCount} 位人員已標記` : "尚無人員標記",
    assignedCount: Number(item.assignedCount || 0),
    due: item.dueDate || "",
    dueDate: parseDate(item.dueDate),
    overdue: Boolean(item.overdue),
    progress: Number(item.progress || 0),
    category: item.categoryName || "一般營運支援",
    minimumLevel: item.minimumLevel || "待確認",
    skills: Array.isArray(item.skills) ? item.skills : [],
    estimatedHoursP50: toNumber(item.estimatedHoursP50),
    estimatedHoursP80: toNumber(item.estimatedHoursP80),
    estimateSampleCount: Number(item.estimateSampleCount || 0),
    estimateConfidence: item.estimateConfidence || "baseline",
    estimateSource: item.estimateSource || "planning-baseline",
    coverageStatus: item.coverageStatus || "unassigned",
    delegation: item.assignedCount > 0
      ? { type: "covered", label: "已有人員標記", className: "good" }
      : { type: "unassigned", label: "待派", className: "danger" },
  }));
}

function parseWorkItems(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- \[[ xX]\]/.test(line))
    .map((line, index) => {
      const done = /^- \[[xX]\]/.test(line);
      let content = line.replace(/^- \[[ xX]\]\s*/, "");
      let metadata = "";
      const metadataMatch = content.match(/（([^）]+)）\s*$/);
      if (metadataMatch) {
        metadata = metadataMatch[1];
        content = content.slice(0, metadataMatch.index).trim();
      }

      const meta = {};
      metadata.split("｜").forEach((part) => {
        const [rawKey, ...rawValue] = part.split(":");
        if (!rawKey || !rawValue.length) return;
        meta[rawKey.trim().toLowerCase()] = rawValue.join(":").trim();
      });

      const due = meta.due || "";
      const dueDate = parseDate(due);
      const overdue = Boolean(!done && dueDate && startOfDay(dueDate) < startOfDay(new Date()));
      const delegation = inferDelegation(content);

      return {
        id: `work-${index + 1}`,
        title: content,
        source: "radar",
        done,
        statusKey: done ? "completed" : "pending",
        owner: meta.owner || "未指定",
        assignedCount: 0,
        status: meta.status || "待確認",
        due,
        dueDate,
        overdue,
        delegation,
      };
    });
}

function inferDelegation(title) {
  const decisionTerms = ["派薪", "權限", "發布", "核准", "正式", "健康資料"];
  const reviewTerms = ["疫苗", "資格", "官方", "薪資", "公開資料", "責任人"];
  const preparationTerms = ["整理", "比較", "標記", "草擬", "核對", "檢查", "盤點"];

  if (decisionTerms.some((term) => title.includes(term))) {
    return { type: "decision", label: "需主管決定", className: "danger" };
  }
  if (reviewTerms.some((term) => title.includes(term))) {
    return { type: "review", label: "可準備，需覆核", className: "warning" };
  }
  if (preparationTerms.some((term) => title.includes(term))) {
    return { type: "delegable", label: "可交辦準備", className: "good" };
  }
  return { type: "decision", label: "先確認邊界", className: "neutral" };
}

function buildSourceStates() {
  const interns = state.datasets.interns;
  const radar = state.datasets.radar;
  const rhythm = state.datasets.rhythm;
  const blueprint = state.datasets.blueprint;
  const workSummary = state.datasets.workSummary;

  return [
    createSourceState("InfoCenter 工作摘要", workSummary?.meta?.generatedAt, Boolean(workSummary)),
    createSourceState("工讀生公開狀態", interns?.meta?.sourceModifiedAt || interns?.meta?.generatedAt, Boolean(interns)),
    createSourceState("每週工作與雷達", radar?.meta?.generatedAt, Boolean(radar)),
    createSourceState("InfoCenter 工作節奏", rhythm?.meta?.generatedAt, Boolean(rhythm)),
    createSourceState("工作藍圖規格", blueprint?.meta?.updatedAt, Boolean(blueprint)),
  ];
}

function createSourceState(name, rawDate, loaded) {
  if (!loaded || !rawDate) {
    return { name, date: null, ageDays: null, status: "error", label: "讀取失敗" };
  }

  const date = parseDate(rawDate);
  if (!date) return { name, date: null, ageDays: null, status: "error", label: "日期不明" };

  const ageDays = Math.max(0, Math.floor((startOfDay(new Date()) - startOfDay(date)) / 86400000));
  if (ageDays <= 7) return { name, date, ageDays, status: "good", label: "7 日內" };
  if (ageDays <= 30) return { name, date, ageDays, status: "warning", label: `${ageDays} 天前` };
  return { name, date, ageDays, status: "danger", label: `${ageDays} 天前` };
}

function buildRecommendations() {
  const items = [];
  const interns = state.datasets.interns;
  const workSummary = state.datasets.workSummary;
  const tracking = state.datasets.tracking;
  const staleSources = state.sources.filter((source) => source.status === "danger");

  if (state.errors.length) {
    items.push({
      priority: "high",
      title: "先修復資料讀取",
      description: `${state.errors.length} 個資料來源讀取失敗，部分數字目前不能作為派工依據。`,
      action: "檢查靜態資料檔與發布狀態",
      reason: state.errors.join("；"),
    });
  }

  if (workSummary && workSummary.meta?.source?.liveWorkFeedConnected === false) {
    items.push({
      priority: "high",
      title: "恢復 InfoCenter 工作摘要",
      description: "本次唯讀工作清單未成功取得，不應使用舊數字安排新一輪派工。",
      action: "檢查登入狀態並重新執行 automation-3",
      reason: "正式工作狀態必須由 InfoCenter 讀回",
    });
  }

  const unassigned = workSummary?.summary?.unassigned || 0;
  if (unassigned) {
    items.push({
      priority: "high",
      title: `處理 ${unassigned} 筆尚無人員標記的工作`,
      description: "先確認工作仍有效，再依能力門檻、P80 工時與本週可用工時選人。",
      action: "回到 InfoCenter 補主責與期限",
      reason: "沒有主責的工作無法形成可追蹤的交付責任",
    });
  }

  const overdue = workSummary?.summary?.overdue || 0;
  if (overdue) {
    items.push({
      priority: "high",
      title: `清理 ${overdue} 筆逾期未完成工作`,
      description: "這批工作可能包含舊案，不應直接視為本週需求；請分成續做、改期與結案三類。",
      action: "先批次確認有效性，再派工",
      reason: "逾期舊案會放大看板需求量並造成錯誤派工",
    });
  }

  const weakCategories = (workSummary?.estimationByCategory || []).filter((item) => ["low", "baseline"].includes(item.confidence));
  if (weakCategories.length) {
    items.push({
      priority: "medium",
      title: `補強 ${weakCategories.length} 個工作類型的工時樣本`,
      description: `${weakCategories.map((item) => item.categoryName).join("、")}目前樣本不足，P80 只能作暫估。`,
      action: "請工讀生在事件評論固定回報實際耗時",
      reason: "至少 3 筆才有中信心，8 筆以上才列高信心",
    });
  }

  staleSources.forEach((source) => {
    items.push({
      priority: "medium",
      title: `更新「${source.name}」`,
      description: `此來源停留在 ${formatDate(source.date)}，已超過 30 天。`,
      action: "先重新產生安全快照，再做分工",
      reason: "過期狀態不能代表目前可投入情形",
    });
  });

  items.push({
    priority: "medium",
    title: "建立每週可用工時回填",
    description: "目前已有工作 P50/P80 與能力門檻，但仍缺每位工讀生本週能投入幾小時。",
    action: "每週一回填可用時數，派工後扣除已承諾 P80",
    reason: "沒有容量分母，只能知道適不適合，不能判斷會不會過載",
  });

  const paused = interns?.meta?.counts?.paused || 0;
  if (paused > 0) {
    items.push({
      priority: "low",
      title: `確認 ${paused} 位暫停成員的後續狀態`,
      description: "將暫停原因、可恢復日期與是否保留聯繫分開處理。",
      action: "安排簡短近況確認，不直接派新工作",
      reason: "避免把暫停成員列入可分配人力",
    });
  }

  const openTracking = (tracking?.items || []).filter((item) => item.status !== "resolved").length;
  if (openTracking) {
    items.push({
      priority: "low",
      title: `整理 ${openTracking} 筆持續追蹤事項`,
      description: "只保留有下一個檢查日期或明確問題的項目。",
      action: "完成、改期或移出本週視圖",
      reason: "避免追蹤清單長期累積成第二個待辦箱",
    });
  }

  return items;
}

function renderSourceStrip() {
  const strip = document.querySelector("#sourceStrip");
  const errors = state.sources.filter((source) => source.status === "error");
  const stale = state.sources.filter((source) => source.status === "danger");

  if (errors.length) {
    strip.className = "source-strip is-error";
    strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>${errors.length} 個來源讀取失敗；目前畫面只顯示成功讀取的資料。</span>`;
    return;
  }

  if (stale.length) {
    strip.className = "source-strip is-warning";
    strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>${stale.length} 個來源超過 30 天未更新。請先看資料日期，再進行派工判斷。</span>`;
    return;
  }

  strip.className = "source-strip";
  strip.innerHTML = '<span class="source-pulse" aria-hidden="true"></span><span>資料已讀取完成；所有數字均附有來源日期。</span>';
}

function renderMetrics() {
  const summary = state.datasets.workSummary?.summary || {};

  const metrics = [
    { label: "待派工作", value: summary.unassigned || 0, hint: `未完成 ${summary.active || 0} 筆中`, icon: "派" },
    { label: "進行中", value: summary.inProgress || 0, hint: "依工作進度唯讀判定", icon: "進" },
    { label: "已完成", value: summary.completed || 0, hint: `本次掃描 ${summary.scannedWorks || 0} 筆`, icon: "完" },
    { label: "逾期未完成", value: summary.overdue || 0, hint: "需先確認是否仍有效", icon: "期" },
  ];

  document.querySelector("#metricGrid").innerHTML = metrics.map((metric) => `
    <article class="metric-card">
      <div class="metric-top"><span>${escapeHtml(metric.label)}</span><span class="metric-icon">${escapeHtml(metric.icon)}</span></div>
      <div class="metric-value">${numberFormat.format(metric.value)}</div>
      <div class="metric-hint">${escapeHtml(metric.hint)}</div>
    </article>
  `).join("");
}

function renderCoverage() {
  const summary = state.datasets.workSummary?.summary || {};
  const cards = [
    {
      label: "人員涵蓋率",
      value: Math.round(toNumber(summary.assignmentCoverageRate) * 100),
      fraction: `${summary.assignmentCoverageCount || 0} / ${summary.active || 0} 筆未完成工作`,
      note: `${summary.unassigned || 0} 筆尚無工讀生標記`,
      tone: toNumber(summary.assignmentCoverageRate) >= 0.9 ? "good" : "warning",
    },
    {
      label: "工時依據覆蓋率",
      value: Math.round(toNumber(summary.estimateEvidenceCoverageRate) * 100),
      fraction: `${summary.timeReportCount || 0} 筆評論耗時回報`,
      note: `未完成工作 P80 合計約 ${numberFormat.format(summary.totalEstimatedHoursP80 || 0)} 小時`,
      tone: toNumber(summary.estimateEvidenceCoverageRate) >= 0.8 ? "good" : "warning",
    },
    {
      label: "本週容量覆蓋率",
      value: 0,
      fraction: "尚未接入可用工時回填",
      note: "不可用歷史工時或事件數替代",
      tone: "missing",
    },
  ];

  document.querySelector("#coverageGrid").innerHTML = cards.map((card) => `
    <article class="coverage-card ${card.tone}">
      <div class="coverage-card-head"><span>${escapeHtml(card.label)}</span><strong>${card.tone === "missing" ? "待接" : `${card.value}%`}</strong></div>
      <div class="coverage-track" aria-hidden="true"><span style="width:${clamp(card.value, 0, 100)}%"></span></div>
      <p>${escapeHtml(card.fraction)}</p>
      <small>${escapeHtml(card.note)}</small>
    </article>`).join("");
}

function renderPriorityBanner() {
  const top = state.recommendations[0];
  const banner = document.querySelector("#priorityBanner");
  if (!top) {
    banner.innerHTML = `
      <div><p class="eyebrow">今天先處理</p><h2>目前沒有明顯例外</h2><p>可進入待派工作，確認下一批可交辦項目。</p></div>
      <button class="button button-light" type="button" data-go-view="dispatch">查看待派工作</button>`;
  } else {
    banner.innerHTML = `
      <div><p class="eyebrow">今天先處理</p><h2>${escapeHtml(top.title)}</h2><p>${escapeHtml(top.description)}</p></div>
      <button class="button button-light" type="button" data-go-view="recommendations">查看全部建議</button>`;
  }
  banner.querySelector("[data-go-view]")?.addEventListener("click", (event) => showView(event.currentTarget.dataset.goView));
}

function renderWorkflow(selector, detailed) {
  const stages = state.datasets.blueprint?.stages || [];
  const target = document.querySelector(selector);
  if (!stages.length) {
    target.innerHTML = '<div class="empty-state">工作藍圖資料尚未讀取。</div>';
    return;
  }

  target.innerHTML = stages.map((stage, index) => {
    const connectionClass = stage.connection === "connected" ? "is-connected" : stage.connection === "partial" ? "is-partial" : "";
    const connectionLabel = stage.connection === "connected" ? "已接資料" : stage.connection === "partial" ? "部分接通" : "待接資料";
    return `
      <article class="workflow-step ${connectionClass}">
        <div class="workflow-node">${index + 1}</div>
        <div class="workflow-title">${escapeHtml(stage.name)}</div>
        <div class="workflow-meta">${escapeHtml(connectionLabel)}</div>
        ${detailed ? `<div class="workflow-description">${escapeHtml(stage.record)}<br>${escapeHtml(stage.doneWhen)}</div>` : ""}
      </article>`;
  }).join("");
}

function renderSourceList() {
  const target = document.querySelector("#sourceList");
  target.innerHTML = state.sources.map((source) => `
    <div class="source-item">
      <div>
        <div class="source-name">${escapeHtml(source.name)}</div>
        <div class="source-date">${source.date ? `資料日期 ${formatDate(source.date)}` : "目前沒有可用日期"}</div>
      </div>
      <span class="status-pill ${source.status}">${escapeHtml(source.label)}</span>
    </div>
  `).join("");
}

function renderTasks() {
  const overview = document.querySelector("#overviewTaskList");
  const dispatch = document.querySelector("#dispatchTaskList");
  const active = state.tasks.filter((task) => !task.done);
  const priority = [...active].sort((a, b) => Number(b.overdue) - Number(a.overdue)
    || a.assignedCount - b.assignedCount
    || String(a.due || "9999").localeCompare(String(b.due || "9999")));
  const filtered = state.tasks.filter((task) => {
    if (state.taskFilter === "active") return !task.done;
    if (state.taskFilter === "unassigned") return !task.done && task.assignedCount === 0;
    if (state.taskFilter === "overdue") return task.overdue;
    if (state.taskFilter === "in_progress") return task.statusKey === "in_progress";
    if (state.taskFilter === "completed") return task.statusKey === "completed";
    return !task.done;
  });

  overview.innerHTML = renderTaskRows(priority.slice(0, 6));
  dispatch.innerHTML = renderTaskRows(filtered);
}

function renderTaskRows(tasks) {
  if (!tasks.length) return '<div class="empty-state">這個篩選條件下沒有待處理工作。</div>';

  return tasks.map((task) => `
    <article class="task-row ${task.overdue ? "is-overdue" : ""}">
      <span class="task-signal" aria-hidden="true"></span>
      <div>
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span>${escapeHtml(task.owner)}</span>
          ${task.minimumLevel ? `<span>門檻：${escapeHtml(task.minimumLevel)}</span>` : ""}
          <span>期限：${task.due ? escapeHtml(task.due) : "未設定"}</span>
          <span>狀態：${escapeHtml(task.status)}</span>
          ${task.estimatedHoursP80 ? `<span>工時 P50 / P80：${numberFormat.format(task.estimatedHoursP50)} / ${numberFormat.format(task.estimatedHoursP80)} 小時</span>` : ""}
        </div>
        ${task.source === "infocenter" ? `<div class="task-evidence"><span>${escapeHtml(estimateConfidenceLabel(task.estimateConfidence))}</span><span>${task.estimateSampleCount} 筆耗時樣本</span><span>${escapeHtml(task.skills.join("、"))}</span></div>` : ""}
      </div>
      <div class="task-side">
        <span class="task-label ${task.delegation.className}">${escapeHtml(task.delegation.label)}</span>
        ${task.progress > 0 ? `<span class="task-label neutral">進度 ${numberFormat.format(task.progress)}%</span>` : ""}
        ${task.overdue ? '<span class="task-label danger">已逾期</span>' : ""}
      </div>
    </article>
  `).join("");
}

function estimateConfidenceLabel(value) {
  return value === "high" ? "高信心工時" : value === "medium" ? "中信心工時" : value === "low" ? "低信心工時" : "規劃基準";
}

function renderPeopleSnapshot() {
  const interns = state.datasets.interns;
  const rhythm = state.datasets.rhythm;
  const counts = interns?.meta?.counts || {};
  const total = counts.total || 0;
  const active = counts.active || 0;
  const paused = counts.paused || 0;
  const activePercent = total ? Math.round((active / total) * 100) : 0;
  const signalPeople = rhythm?.summary?.peopleCount || 0;

  document.querySelector("#peopleSnapshot").innerHTML = `
    <div class="snapshot-number"><strong>${numberFormat.format(active)}</strong><span>位 active 成員</span></div>
    <div class="snapshot-bars">
      <div>
        <div class="snapshot-bar-head"><span>Active 比例</span><strong>${activePercent}%</strong></div>
        <div class="progress-track"><div class="progress-fill" style="width:${clamp(activePercent, 0, 100)}%"></div></div>
      </div>
      <div>
        <div class="snapshot-bar-head"><span>暫停成員</span><strong>${paused}</strong></div>
        <div class="progress-track"><div class="progress-fill warning" style="width:${total ? clamp((paused / total) * 100, 0, 100) : 0}%"></div></div>
      </div>
    </div>
    <p class="metric-hint">工作節奏資料涵蓋 ${signalPeople} 人；這是歷史訊號，不代表本週可用時數。</p>`;
}

function renderPeopleSummary() {
  const interns = state.datasets.interns;
  const rhythm = state.datasets.rhythm;
  const counts = interns?.meta?.counts || {};
  const totalHours = (interns?.interns || []).reduce((sum, person) => sum + toNumber(person.workHoursThisMonth), 0);
  const cards = [
    { label: "成員總數", value: counts.total || 0, hint: "公開安全快照" },
    { label: "Active", value: counts.active || 0, hint: "可聯繫，不等於本週有空" },
    { label: "快照工時", value: numberFormat.format(totalHours), hint: "來源月份的歷史合計" },
    { label: "工作訊號", value: rhythm?.summary?.totalSignals || 0, hint: `${rhythm?.summary?.peopleCount || 0} 人的聚合訊號` },
  ];

  document.querySelector("#peopleSummaryGrid").innerHTML = cards.map((card) => `
    <article class="people-summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(String(card.value))}</strong>
      <span>${escapeHtml(card.hint)}</span>
    </article>`).join("");
}

function renderPeopleGrid() {
  const people = [...(state.datasets.interns?.interns || [])]
    .map((person) => ({
      ...person,
      safeName: maskName(person.displayName || "未命名"),
      hours: toNumber(person.workHoursThisMonth),
    }))
    .filter((person) => state.peopleStatus === "all" || person.status === state.peopleStatus)
    .filter((person) => !state.peopleSearch || person.safeName.toLowerCase().includes(state.peopleSearch))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.hours - b.hours;
    });

  const target = document.querySelector("#peopleGrid");
  if (!people.length) {
    target.innerHTML = '<div class="empty-state">找不到符合條件的成員。</div>';
    return;
  }

  target.innerHTML = people.map((person) => {
    const active = person.status === "active";
    const paid = person.payStatusThisMonth === "paid";
    return `
      <article class="person-card">
        <div class="person-card-top">
          <div class="person-identity">
            <div class="person-avatar" aria-hidden="true">${escapeHtml(person.safeName.slice(0, 1))}</div>
            <div><h3>${escapeHtml(person.safeName)}</h3><p>${escapeHtml(person.currentRole || "工讀生")}</p></div>
          </div>
          <span class="status-pill ${active ? "good" : "warning"}">${active ? "可聯繫" : "暫停"}</span>
        </div>
        <div class="person-facts">
          <div class="person-fact"><span>快照工時</span><strong>${numberFormat.format(person.hours)} 小時</strong></div>
          <div class="person-fact"><span>派薪狀態</span><strong>${paid ? "paid" : escapeHtml(person.payStatusThisMonth || "n/a")}</strong></div>
        </div>
        <p>${active ? "可列入候選，但仍需確認本週可用時數與能力門檻。" : "目前不建議派新工作，先確認何時可恢復。"}</p>
      </article>`;
  }).join("");
}

function renderDomains() {
  const domains = state.datasets.blueprint?.domains || [];
  const target = document.querySelector("#domainGrid");
  if (!domains.length) {
    target.innerHTML = '<div class="empty-state">工作域資料尚未讀取。</div>';
    return;
  }

  target.innerHTML = domains.map((domain) => `
    <article class="domain-card">
      <div class="domain-card-header">
        <div><span class="domain-code">${escapeHtml(domain.id)}</span><h3>${escapeHtml(domain.name)}</h3></div>
        <span class="status-pill neutral">${escapeHtml(domain.payBasis)}</span>
      </div>
      <p>${escapeHtml(domain.description)}</p>
      <ul class="domain-list">${(domain.templates || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <div class="domain-tags">${(domain.skills || []).map((skill) => `<span class="domain-tag">${escapeHtml(skill)}</span>`).join("")}</div>
    </article>`).join("");
}

function renderRecommendations() {
  const overview = document.querySelector("#overviewRecommendations");
  const full = document.querySelector("#recommendationList");

  if (!state.recommendations.length) {
    const empty = '<div class="empty-state">目前沒有需要優先處理的建議。</div>';
    overview.innerHTML = empty;
    full.innerHTML = empty;
    return;
  }

  overview.innerHTML = state.recommendations.slice(0, 3).map((item) => `
    <article class="recommendation-card">
      <span class="status-pill ${priorityClass(item.priority)}">${priorityLabel(item.priority)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="recommendation-action">下一步：${escapeHtml(item.action)}</div>
    </article>`).join("");

  full.innerHTML = state.recommendations.map((item, index) => `
    <article class="recommendation-item ${item.priority === "high" ? "is-high" : ""}">
      <div class="recommendation-rank">${index + 1}</div>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="recommendation-reason">原因：${escapeHtml(item.reason)}</div>
      </div>
      <span class="status-pill ${priorityClass(item.priority)}">${priorityLabel(item.priority)}</span>
    </article>`).join("");
}

function updateNavigationCounts() {
  document.querySelector("#navDispatchCount").textContent = String(state.datasets.workSummary?.summary?.unassigned
    ?? state.tasks.filter((task) => !task.done).length);
  document.querySelector("#navRecommendationCount").textContent = String(state.recommendations.length);
}

function updateFooter() {
  const latest = state.sources
    .map((source) => source.date)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  document.querySelector("#footerTimestamp").textContent = latest
    ? `最新來源日期：${formatDate(latest)}｜頁面讀取：${formatDateTime(new Date())}`
    : `頁面讀取：${formatDateTime(new Date())}`;
}

async function copyManagementBrief() {
  const interns = state.datasets.interns?.meta?.counts || {};
  const summary = state.datasets.workSummary?.summary || {};
  const brief = [
    "# 工讀生總工作藍圖摘要",
    `- InfoCenter 掃描：${summary.scannedWorks || 0} 筆工作`,
    `- 未完成：${summary.active || 0} 筆（待派 ${summary.unassigned || 0}、進行中 ${summary.inProgress || 0}）`,
    `- 已完成：${summary.completed || 0} 筆`,
    `- 逾期未完成：${summary.overdue || 0} 筆`,
    `- 人員涵蓋率：${Math.round(toNumber(summary.assignmentCoverageRate) * 100)}%`,
    `- 工時依據：${summary.timeReportCount || 0} 筆評論回報，未完成工作 P80 約 ${numberFormat.format(summary.totalEstimatedHoursP80 || 0)} 小時`,
    `- Active 成員：${interns.active || 0} 位`,
    `- 暫停成員：${interns.paused || 0} 位`,
    `- 建議事項：${state.recommendations.length} 筆`,
    "",
    "## 優先建議",
    ...state.recommendations.slice(0, 5).map((item) => `- ${item.title}：${item.action}`),
    "",
    "注意：本週可用工時尚未接入；正式派工、驗收與派薪請回到 InfoCenter。",
  ].join("\n");
  await copyText(brief, "管理摘要已複製");
}

async function copyRecommendationList() {
  const text = state.recommendations.map((item, index) => `${index + 1}. ${item.title}\n   下一步：${item.action}\n   原因：${item.reason}`).join("\n\n");
  await copyText(text || "目前沒有建議事項。", "建議清單已複製");
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    showToast("無法使用剪貼簿，請直接選取頁面文字");
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function priorityLabel(priority) {
  return priority === "high" ? "優先" : priority === "medium" ? "本週" : "可排程";
}

function priorityClass(priority) {
  return priority === "high" ? "danger" : priority === "medium" ? "warning" : "neutral";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return date ? dateFormat.format(date) : "日期不明";
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function maskName(value) {
  const name = String(value || "").trim();
  if (!name) return "未命名";
  if (/[○＊*]/.test(name)) return name;
  if (/^[\u3400-\u9fff]+$/.test(name)) return `${name.slice(0, 1)}○○`;
  return `${name.slice(0, 1).toUpperCase()}***`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
