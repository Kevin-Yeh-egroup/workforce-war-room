const DATA_PATHS = {
  interns: "./data/interns.public.json",
  radar: "./data/radar-week.json",
  tracking: "./data/radar-tracking.json",
  workItems: "./data/radar-work-items.md",
  workSummary: "./data/infocenter-work-summary.json",
  rhythm: "./data/work-rhythm.internal.json",
  blueprint: "./data/work-blueprint.json",
  capacity: "./data/capacity-week.public.json",
  notifications: "./data/reminders.public.json",
  eventExperience: "./data/event-experience.public.json",
  fields: "./local-spec/fields.json",
  capabilities: "./data/capability-framework.public.json",
};

const state = {
  currentView: "overview",
  taskFilter: "active",
  peopleSearch: "",
  datasets: {},
  tasks: [],
  recommendations: [],
  sources: [],
  errors: [],
  activeTaskId: null,
  activeRecommendationIndex: null,
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
    capacity: fetchJson(DATA_PATHS.capacity),
    notifications: fetchJson(DATA_PATHS.notifications),
    eventExperience: fetchJson(DATA_PATHS.eventExperience),
    fields: fetchJson(DATA_PATHS.fields),
    capabilities: fetchJson(DATA_PATHS.capabilities),
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
  renderCapabilityFramework();
  renderPeopleGrid();
  renderDomains();
  renderRecommendations();
  renderNotifications();
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
  if (["overview", "dispatch", "people", "blueprint", "recommendations", "notifications"].includes(requestedView)) {
    showView(requestedView, false);
  }
}

function bindControls() {
  document.querySelector("#reloadButton").addEventListener("click", loadDashboard);
  document.querySelector("#copyBriefButton").addEventListener("click", copyManagementBrief);
  document.querySelector("#copyRecommendationButton").addEventListener("click", copyRecommendationList);
  document.querySelector("#copyNotificationButton").addEventListener("click", copyNotificationList);
  document.querySelector("#closeTaskDetail").addEventListener("click", () => document.querySelector("#taskDetailDialog").close());
  document.querySelector("#copyTaskLocator").addEventListener("click", copyActiveTaskLocator);
  document.querySelector("#taskDetailDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector("#closeRecommendationDetail").addEventListener("click", () => document.querySelector("#recommendationDetailDialog").close());
  document.querySelector("#copyRecommendationDetail").addEventListener("click", copyActiveRecommendationDetail);
  document.querySelector("#goToRecommendationTasks").addEventListener("click", goToActiveRecommendationTasks);
  document.querySelector("#recommendationDetailDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });

  document.querySelectorAll("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      setTaskFilter(button.dataset.taskFilter);
    });
  });

  document.querySelector("#peopleSearch").addEventListener("input", (event) => {
    state.peopleSearch = event.target.value.trim().toLowerCase();
    renderPeopleGrid();
  });

}

function setTaskFilter(filter) {
  state.taskFilter = filter;
  document.querySelectorAll("[data-task-filter]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.taskFilter === filter);
  });
  renderTasks();
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
    categoryId: item.categoryId || "GENERAL_OPS",
    minimumLevel: item.minimumLevel || "待確認",
    skills: Array.isArray(item.skills) ? item.skills : [],
    estimatedHoursP50: toNumber(item.estimatedHoursP50),
    estimatedHoursP80: toNumber(item.estimatedHoursP80),
    estimateSampleCount: Number(item.estimateSampleCount || 0),
    estimateConfidence: item.estimateConfidence || "baseline",
    estimateSource: item.estimateSource || "planning-baseline",
    coverageStatus: item.coverageStatus || "unassigned",
    eventCount: Number(item.eventCount || 0),
    completedEventCount: Number(item.completedEventCount || 0),
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
  const capacity = state.datasets.capacity;
  const eventExperience = state.datasets.eventExperience;

  return [
    createSourceState("InfoCenter 工作摘要", workSummary?.meta?.generatedAt, Boolean(workSummary)),
    createSourceState("工讀生公開狀態", interns?.meta?.sourceModifiedAt || interns?.meta?.generatedAt, Boolean(interns)),
    createSourceState("每週工作與雷達", radar?.meta?.generatedAt, Boolean(radar)),
    createSourceState("InfoCenter 工作節奏", rhythm?.meta?.generatedAt, Boolean(rhythm)),
    createSourceState("工作藍圖規格", blueprint?.meta?.updatedAt, Boolean(blueprint)),
    createSourceState("本週可用工時", capacity?.meta?.generatedAt, Boolean(capacity)),
    createEventExperienceSourceState(eventExperience),
  ];
}

function createEventExperienceSourceState(dataset) {
  const readiness = getEventExperienceReadiness();
  const base = createSourceState("InfoCenter 事件 XP", dataset?.meta?.sourceFetchedAt, Boolean(dataset));
  if (!dataset) return base;
  return {
    ...base,
    status: readiness.ready ? base.status : "warning",
    label: readiness.sourceLabel,
    blocking: !readiness.ready,
  };
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

function getTaskIssueType(task) {
  if (!task.done && task.statusKey === "in_progress" && task.assignedCount === 0) return "owner_conflict";
  if (!task.done && task.statusKey === "pending" && task.assignedCount > 0 && task.eventCount > 0) return "status_review";
  return null;
}

function getCurrentWeekStart(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const dateOfMonth = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateOfMonth}`;
}

function getCapacityMap() {
  const capacity = state.datasets.capacity;
  if (capacity?.meta?.weekStart !== getCurrentWeekStart()) return new Map();
  const activeIds = new Set((state.datasets.interns?.interns || [])
    .filter((person) => person.status === "active")
    .map((person) => String(person.id)));
  const entries = (capacity?.entries || []).filter((entry) => {
    const hours = Number(entry.availableHours);
    return activeIds.has(String(entry.personId))
      && Number.isFinite(hours)
      && hours >= 0
      && hours <= 40
      && (!entry.capabilities || typeof entry.capabilities === "object");
  });
  return new Map(entries.map((entry) => [String(entry.personId), { ...entry, availableHours: Number(entry.availableHours) }]));
}

function getEventExperienceMap() {
  return getEventExperienceReadiness().map;
}

function getEventExperienceReadiness() {
  const activeIds = new Set((state.datasets.interns?.interns || [])
    .filter((person) => person.status === "active")
    .map((person) => String(person.id)));
  const policy = window.EventExperiencePolicy;
  if (!policy || typeof policy.inspect !== "function") {
    return { ready: false, reason: "policy_missing", sourceLabel: "待事件核對・驗證器未讀取", map: new Map() };
  }
  return policy.inspect(state.datasets.eventExperience, activeIds, {
    sourceModifiedAt: state.datasets.interns?.meta?.sourceModifiedAt || "",
    sourceFingerprint: state.datasets.interns?.meta?.sourceFingerprint || "",
  });
}

function getCapacityStats() {
  const activeCount = (state.datasets.interns?.interns || []).filter((person) => person.status === "active").length;
  const capacityMap = getCapacityMap();
  return {
    activeCount,
    covered: capacityMap.size,
    availableHours: [...capacityMap.values()].reduce((sum, entry) => sum + entry.availableHours, 0),
    coverageRate: activeCount ? capacityMap.size / activeCount : 0,
  };
}

function buildTaskRecommendationDetail(task, change) {
  return {
    key: task.id,
    title: task.title,
    meta: [
      `狀態：${task.status}`,
      task.owner,
      `期限：${task.due || "未設定"}`,
      `事件：${task.eventCount} 筆`,
      `P80：${numberFormat.format(task.estimatedHoursP80)} 小時`,
    ],
    change,
  };
}

function buildPersonRecommendationDetail(person, change) {
  return {
    key: person.id,
    title: maskName(person.displayName || "未命名"),
    meta: [
      `目前狀態：${person.status === "active" ? "active" : "paused"}`,
      person.currentRole ? `角色：${person.currentRole}` : "角色：未設定",
      person.workLevel ? `既有等級：${person.workLevel}` : "既有等級：未設定",
    ],
    change,
  };
}

function buildRecommendations() {
  const items = [];
  const interns = state.datasets.interns;
  const workSummary = state.datasets.workSummary;
  const tracking = state.datasets.tracking;
  const staleSources = state.sources.filter((source) => source.status === "danger");
  const ownerConflictTasks = state.tasks.filter((task) => getTaskIssueType(task) === "owner_conflict");
  const unassignedTasks = state.tasks.filter((task) => !task.done && task.assignedCount === 0);
  const overdueTasks = state.tasks.filter((task) => !task.done && task.overdue);
  const statusReviewTasks = state.tasks.filter((task) => getTaskIssueType(task) === "status_review");
  const capacityMap = getCapacityMap();
  const activePeople = (interns?.interns || []).filter((person) => person.status === "active");
  const missingCapacityPeople = activePeople.filter((person) => !capacityMap.has(String(person.id)));
  const openTrackingItems = (tracking?.items || []).filter((item) => item.status !== "resolved");

  if (state.errors.length) {
    items.push({
      priority: "high",
      title: "先修復資料讀取",
      description: `${state.errors.length} 個資料來源讀取失敗，部分數字目前不能作為派工依據。`,
      action: "檢查靜態資料檔與發布狀態",
      reason: state.errors.join("；"),
      details: state.errors.map((error, index) => ({
        key: `SOURCE-${index + 1}`,
        title: `資料來源錯誤 ${index + 1}`,
        meta: [error],
        change: "檢查檔案是否存在、JSON 是否有效，以及發布版本是否包含該來源。",
      })),
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

  const hardConflicts = ownerConflictTasks.length;
  if (hardConflicts) {
    items.push({
      priority: "high",
      title: `先確認 ${hardConflicts} 筆「進行中但無人員標記」工作`,
      description: "這些工作不能直接當成一般待派；可能是主責遺失、狀態未更新或工作已失效。",
      action: "逐筆確認主責與實際狀態，再決定補派或結案",
      reason: "若直接重派，可能產生重複執行與責任不清",
      taskFilter: "conflict",
      details: ownerConflictTasks.map((task) => buildTaskRecommendationDetail(
        task,
        "先確認實際主責；續做則補上人員標記並校正進度，已失效則結案。",
      )),
    });
  }

  const unassigned = unassignedTasks.length;
  if (unassigned) {
    items.push({
      priority: "high",
      title: `處理 ${unassigned} 筆尚無人員標記的工作`,
      description: "先確認工作仍有效，再依能力門檻、P80 工時與本週可用工時選人。",
      action: "回到 InfoCenter 補主責與期限",
      reason: "沒有主責的工作無法形成可追蹤的交付責任",
      taskFilter: "unassigned",
      details: unassignedTasks.map((task) => buildTaskRecommendationDetail(
        task,
        task.statusKey === "in_progress"
          ? "先確認正在執行的人；續做則補主責，已失效則結案，不要直接重派。"
          : "先確認工作仍有效；續做則補主責、期限與工作範本，失效則結案。",
      )),
    });
  }

  const overdue = overdueTasks.length;
  if (overdue) {
    items.push({
      priority: "high",
      title: `清理 ${overdue} 筆逾期未完成工作`,
      description: "這批工作可能包含舊案，不應直接視為本週需求；請分成續做、改期與結案三類。",
      action: "先批次確認有效性，再派工",
      reason: "逾期舊案會放大看板需求量並造成錯誤派工",
      taskFilter: "overdue",
      details: overdueTasks.map((task) => buildTaskRecommendationDetail(
        task,
        "在 InfoCenter 選擇：仍有效則更新期限；已完成則補驗收並結案；不再執行則取消或結案。",
      )),
    });
  }

  const statusReview = statusReviewTasks.length;
  if (statusReview) {
    items.push({
      priority: "medium",
      title: `釐清 ${statusReview} 筆已有主責與事件、但仍顯示待開始的工作`,
      description: "事件可能只是事前建立，也可能代表工作狀態未隨執行更新；目前不能一律判定已開始。",
      action: "抽查事件內容後，統一工作與事件的狀態語意",
      reason: "避免把已執行工作重複派出，或把空事件誤當成執行證據",
      taskFilter: "conflict",
      details: statusReviewTasks.map((task) => buildTaskRecommendationDetail(
        task,
        "抽查事件內容；有執行證據則更新工作為進行中，只有事前空事件則保留待開始並補註記。",
      )),
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
      systemTarget: "event",
      details: weakCategories.map((category) => ({
        key: category.categoryId,
        title: category.categoryName,
        meta: [
          `樣本：${category.sampleCount} 筆`,
          `目前信心：${estimateConfidenceLabel(category.confidence)}`,
          `P50 / P80：${numberFormat.format(category.p50Hours)} / ${numberFormat.format(category.p80Hours)} 小時`,
        ],
        change: "要求事件完成評論固定填寫實際耗時；累積至少 3 筆後再更新估時信心。",
      })),
    });
  }

  staleSources.forEach((source) => {
    items.push({
      priority: "medium",
      title: `更新「${source.name}」`,
      description: `此來源停留在 ${formatDate(source.date)}，已超過 30 天。`,
      action: "先重新產生安全快照，再做分工",
      reason: "過期狀態不能代表目前可投入情形",
      details: [{
        key: source.name,
        title: source.name,
        meta: [`資料日期：${formatDate(source.date)}`, `距今：${source.ageDays} 天`],
        change: "重新產生公開安全快照，確認來源日期與人員狀態後再進行派工。",
      }],
    });
  });

  const capacityStats = getCapacityStats();
  if (capacityStats.covered < capacityStats.activeCount) {
    items.push({
      priority: "medium",
      title: `補齊 ${capacityStats.activeCount - capacityStats.covered} 位 active 成員的本週可用工時`,
      description: `目前只有 ${capacityStats.covered}/${capacityStats.activeCount} 位具備有效的本週可用工時。能力證據與容量分開審查。`,
      action: "每週一回填可用時數；派工時再比對四類知能證據與工作需求",
      reason: "沒有容量分母，只能知道適不適合，不能判斷會不會過載",
      systemTarget: "people",
      details: missingCapacityPeople.map((person) => buildPersonRecommendationDetail(
        person,
        "補填本週可用工時；能力證據候選由已驗收工作產生，仍需人工確認。",
      )),
    });
  }

  const openTracking = openTrackingItems.length;
  if (openTracking) {
    items.push({
      priority: "low",
      title: `整理 ${openTracking} 筆持續追蹤事項`,
      description: "只保留有下一個檢查日期或明確問題的項目。",
      action: "完成、改期或移出本週視圖",
      reason: "避免追蹤清單長期累積成第二個待辦箱",
      details: openTrackingItems.map((item) => ({
        key: item.id,
        title: item.title,
        meta: [`狀態：${item.status}`, `下次檢查：${item.nextCheck || "未設定"}`, item.question || "尚無檢查問題"],
        change: "在追蹤清單標記完成、設定新的檢查日期，或移出本週視圖。",
      })),
    });
  }

  return items;
}

function renderSourceStrip() {
  const strip = document.querySelector("#sourceStrip");
  const errors = state.sources.filter((source) => source.status === "error");
  const blocked = state.sources.filter((source) => source.blocking);
  const stale = state.sources.filter((source) => source.status === "danger");

  if (errors.length) {
    strip.className = "source-strip is-error";
    strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>${errors.length} 個來源讀取失敗；目前畫面只顯示成功讀取的資料。</span>`;
    return;
  }

  if (blocked.length) {
    strip.className = "source-strip is-warning";
    strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>${blocked.length} 個來源尚未通過完整性驗證；對應指標已停在待核對狀態。</span>`;
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
  const capacity = getCapacityStats();
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
      value: Math.round(capacity.coverageRate * 100),
      fraction: `${capacity.covered} / ${capacity.activeCount} 位 active 成員`,
      note: capacity.covered
        ? `已登錄 ${numberFormat.format(capacity.availableHours)} 小時；不可用歷史工時替代`
        : "本週尚無有效回填；不可用歷史工時或事件數替代",
      tone: capacity.covered === 0 ? "missing" : capacity.coverageRate >= 0.9 ? "good" : "warning",
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
  const priority = [...active].sort((a, b) => Number(Boolean(getTaskIssueType(b))) - Number(Boolean(getTaskIssueType(a)))
    || Number(b.overdue) - Number(a.overdue)
    || a.assignedCount - b.assignedCount
    || String(a.due || "9999").localeCompare(String(b.due || "9999")));
  const filtered = state.tasks.filter((task) => {
    if (state.taskFilter === "active") return !task.done;
    if (state.taskFilter === "conflict") return Boolean(getTaskIssueType(task));
    if (state.taskFilter === "unassigned") return !task.done && task.assignedCount === 0;
    if (state.taskFilter === "overdue") return !task.done && task.overdue;
    if (state.taskFilter === "in_progress") return task.statusKey === "in_progress";
    if (state.taskFilter === "completed") return task.statusKey === "completed";
    return !task.done;
  }).sort((a, b) => Number(Boolean(getTaskIssueType(b))) - Number(Boolean(getTaskIssueType(a)))
    || Number(b.overdue) - Number(a.overdue)
    || a.assignedCount - b.assignedCount
    || String(a.due || "9999").localeCompare(String(b.due || "9999")));

  overview.innerHTML = renderTaskRows(priority.slice(0, 6));
  dispatch.innerHTML = renderTaskRows(filtered);
  bindTaskDetailButtons();
}

function renderTaskRows(tasks) {
  if (!tasks.length) return '<div class="empty-state">這個篩選條件下沒有待處理工作。</div>';

  return tasks.map((task) => {
    const issueType = getTaskIssueType(task);
    const issueLabel = issueType === "owner_conflict" ? "狀態矛盾" : issueType === "status_review" ? "待確認狀態" : "";
    return `
    <article class="task-row ${task.overdue ? "is-overdue" : ""} ${issueType ? "is-conflict" : ""}">
      <span class="task-signal" aria-hidden="true"></span>
      <div>
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span>${escapeHtml(task.owner)}</span>
          ${task.minimumLevel ? `<span>門檻：${escapeHtml(capabilityStageLabel(task.minimumLevel))}</span>` : ""}
          <span>期限：${task.due ? escapeHtml(task.due) : "未設定"}</span>
          <span>狀態：${escapeHtml(task.status)}</span>
          ${task.estimatedHoursP80 ? `<span>工時 P50 / P80：${numberFormat.format(task.estimatedHoursP50)} / ${numberFormat.format(task.estimatedHoursP80)} 小時</span>` : ""}
        </div>
        ${task.source === "infocenter" ? `<div class="task-evidence"><span>${escapeHtml(estimateConfidenceLabel(task.estimateConfidence))}</span><span>${task.estimateSampleCount} 筆耗時樣本</span><span>${escapeHtml(task.skills.join("、"))}</span></div>` : ""}
      </div>
      <div class="task-side">
        ${issueLabel ? `<span class="task-label warning">${escapeHtml(issueLabel)}</span>` : ""}
        <span class="task-label ${task.delegation.className}">${escapeHtml(task.delegation.label)}</span>
        ${task.progress > 0 ? `<span class="task-label neutral">進度 ${numberFormat.format(task.progress)}%</span>` : ""}
        ${task.overdue ? '<span class="task-label danger">已逾期</span>' : ""}
        <button class="task-action" type="button" data-task-detail-id="${escapeHtml(task.id)}">查看處理方式</button>
      </div>
    </article>
  `;
  }).join("");
}

function bindTaskDetailButtons() {
  document.querySelectorAll("[data-task-detail-id]").forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(button.dataset.taskDetailId));
  });
}

function openTaskDetail(id) {
  const task = state.tasks.find((item) => String(item.id) === String(id));
  if (!task) return;
  state.activeTaskId = task.id;
  const issueType = getTaskIssueType(task);
  const triage = issueType === "owner_conflict"
    ? "狀態為進行中但沒有任何人員標記。先確認實際主責，再決定補派、更新狀態或結案。"
    : issueType === "status_review"
      ? "已有主責與事件，但工作仍顯示待開始。先抽查事件是否含實際執行證據，再統一狀態。"
      : task.overdue
        ? "先判斷這筆工作要續做、改期或結案；確認仍有效後才進行派工。"
        : task.assignedCount === 0
          ? "工作仍有效時，依能力門檻與 P80 工時補上主責；沒有容量資料前不做自動指派。"
          : "主責已標記；下一步應確認事件中的活動、成果連結、送審與人工驗收。";
  const matchPanel = renderTaskCapabilityMatches(task);
  document.querySelector("#taskDetailTitle").textContent = task.title;
  document.querySelector("#taskDetailBody").innerHTML = `
    <div class="task-detail-grid">
      <div><span>公開代碼</span><strong>${escapeHtml(task.id)}</strong></div>
      <div><span>目前狀態</span><strong>${escapeHtml(task.status)}</strong></div>
      <div><span>人員標記</span><strong>${escapeHtml(task.owner)}</strong></div>
      <div><span>期限</span><strong>${task.due ? escapeHtml(task.due) : "未設定"}</strong></div>
      <div><span>判斷門檻</span><strong>${escapeHtml(capabilityStageLabel(task.minimumLevel))}</strong></div>
      <div><span>預估 P50 / P80</span><strong>${numberFormat.format(task.estimatedHoursP50)} / ${numberFormat.format(task.estimatedHoursP80)} 小時</strong></div>
    </div>
    <div class="task-triage-note"><span>建議處理</span><p>${escapeHtml(triage)}</p></div>
    ${matchPanel}
    <div class="task-detail-evidence">
      <span>事件 ${task.eventCount} 筆</span>
      <span>完成事件 ${task.completedEventCount} 筆</span>
      ${(task.skills || []).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}
    </div>
    <p class="task-dialog-boundary">公開摘要不保存原始工作標題或 InfoCenter 原始 ID，因此無法安全產生精確深層連結。請以公開代碼與狀態在一般工作清單中查找，並由人員確認後才變更。</p>`;
  document.querySelector("#taskDetailDialog").showModal();
}

async function copyActiveTaskLocator() {
  const task = state.tasks.find((item) => String(item.id) === String(state.activeTaskId));
  if (!task) return;
  const issueType = getTaskIssueType(task);
  const text = [
    `工作：${task.title}`,
    `公開代碼：${task.id}`,
    `狀態：${task.status}`,
    `人員標記：${task.owner}`,
    `期限：${task.due || "未設定"}`,
    `需確認：${issueType === "owner_conflict" ? "進行中但無人員標記" : issueType === "status_review" ? "已有主責與事件但仍待開始" : task.overdue ? "逾期有效性" : "無"}`,
    "注意：公開摘要沒有 InfoCenter 原始 ID，請在一般工作清單人工確認後再變更。",
  ].join("\n");
  await copyText(text, "工作查找摘要已複製");
}

function estimateConfidenceLabel(value) {
  return value === "high" ? "高信心工時" : value === "medium" ? "中信心工時" : value === "low" ? "低信心工時" : "規劃基準";
}

function renderPeopleSnapshot() {
  const interns = state.datasets.interns;
  const rhythm = state.datasets.rhythm;
  const counts = interns?.meta?.counts || {};
  const active = counts.active || 0;
  const signalPeople = rhythm?.summary?.peopleCount || 0;
  const capacity = getCapacityStats();
  const capacityPercent = capacity.activeCount ? Math.round((capacity.covered / capacity.activeCount) * 100) : 0;

  document.querySelector("#peopleSnapshot").innerHTML = `
    <div class="snapshot-number"><strong>${numberFormat.format(active)}</strong><span>位 active 成員</span></div>
    <div class="snapshot-bars">
      <div>
        <div class="snapshot-bar-head"><span>本週容量已回填</span><strong>${capacity.covered}/${capacity.activeCount}</strong></div>
        <div class="progress-track"><div class="progress-fill" style="width:${clamp(capacityPercent, 0, 100)}%"></div></div>
      </div>
    </div>
    <p class="metric-hint">本週容量已回填 ${capacity.covered}/${capacity.activeCount} 位；工作節奏資料涵蓋 ${signalPeople} 人，但歷史訊號不代表本週可用時數。</p>`;
}

function renderPeopleSummary() {
  const interns = state.datasets.interns;
  const counts = interns?.meta?.counts || {};
  const capacity = getCapacityStats();
  const activePeople = (interns?.interns || []).filter((person) => person.status === "active");
  const emailCount = activePeople.filter((person) => person.maskedEmail).length;
  const cards = [
    { label: "可聯繫成員", value: counts.active || 0, hint: "本頁只呈現 active" },
    { label: "遮罩 Email", value: `${emailCount}/${counts.active || 0}`, hint: "完整 Email 不公開" },
    { label: "容量已回填", value: `${capacity.covered}/${capacity.activeCount}`, hint: "只計有效的本週可用工時" },
    { label: "本週可用", value: `${numberFormat.format(capacity.availableHours)}h`, hint: capacity.covered ? "有效回填合計" : "尚無有效回填" },
  ];

  document.querySelector("#peopleSummaryGrid").innerHTML = cards.map((card) => `
    <article class="people-summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(String(card.value))}</strong>
      <span>${escapeHtml(card.hint)}</span>
    </article>`).join("");
}

function renderCapabilityFramework() {
  const framework = state.datasets.capabilities;
  const domains = framework?.domains || [];
  const stages = framework?.stages || [];
  const target = document.querySelector("#levelGuideGrid");
  if (!domains.length || !stages.length) {
    target.innerHTML = '<div class="empty-state">能力框架尚未讀取。</div>';
    return;
  }

  target.innerHTML = domains.map((domain) => `
    <article class="capability-domain-card">
      <span>能力面向</span>
      <h4>${escapeHtml(domain.name)}</h4>
      <div class="capability-stage-list">
        ${stages.map((stage) => `
          <div>
            <strong>${escapeHtml(stage.name)}</strong>
            <p>${escapeHtml(domain.stages?.[stage.id] || stage.summary)}</p>
          </div>`).join("")}
      </div>
    </article>`).join("");

  const coveredMonths = state.datasets.interns?.meta?.history?.coveredMonths || [];
  const firstMonth = coveredMonths[0];
  const lastMonth = coveredMonths[coveredMonths.length - 1];
  const evidenceRange = firstMonth && lastMonth ? `${firstMonth} 至 ${lastMonth}` : "目前公開快照";
  document.querySelector("#capabilityEvidenceNote").innerHTML = `
    <strong>目前是候選證據，不是完整能力盤點。</strong>
    <p>知能指數目前使用 ${escapeHtml(evidenceRange)} 工時報帳中的主要工作分類；正式 XP 改由 InfoCenter 事件的 SUCCESS、已關閉狀態與核准分鐘確認。尚未完成事件對帳者只顯示歷史投入參考，不列入級距。</p>`;

  renderCapabilityRules(framework);
}

function renderCapabilityRules(framework) {
  const speech = framework.speechToText || {};
  const progression = framework.progressionRules || {};
  const salary = framework.salaryReviewRules || {};
  const speechTarget = document.querySelector("#speechClassification");
  const policyTarget = document.querySelector("#capabilityPolicyGrid");
  const experienceTarget = document.querySelector("#experiencePolicyGrid");

  experienceTarget.innerHTML = renderExperiencePolicy(framework);

  speechTarget.innerHTML = `
    <div class="rule-card-head"><span>主要歸類</span><strong>${escapeHtml(speech.primaryDomain || "待確認")}</strong></div>
    <div class="rule-step-list">${(speech.rules || []).map((item) => `
      <div><strong>${escapeHtml(item.stage)}</strong><p>${escapeHtml(item.classification)}</p></div>`).join("")}</div>
    <p class="rule-footnote">${escapeHtml(speech.secondaryEvidence || "")}</p>`;

  policyTarget.innerHTML = `
    <article class="policy-card">
      <span>能力進階</span>
      <h4>通過門檻才列為候選</h4>
      <p>${escapeHtml(progression.principle || "")}</p>
      <ul>${(progression.gates || []).map((gate) => `<li><strong>${escapeHtml(gate.stage)}：</strong>${escapeHtml(gate.rule)}</li>`).join("")}</ul>
      <small>現有資料仍缺：${escapeHtml((progression.currentlyMissing || []).join("、"))}</small>
    </article>
    <article class="policy-card salary-policy-card">
      <span>薪資級距</span>
      <h4>符合資格後再人工審查</h4>
      <p>${escapeHtml(salary.principle || "")}</p>
      <ul>${(salary.paths || []).map((path) => `<li>${escapeHtml(path)}</li>`).join("")}</ul>
      <small>${escapeHtml(salary.humanDecision || "")}</small>
    </article>`;
}

function renderExperiencePolicy(framework) {
  const xp = framework.experiencePolicy || {};
  const salaryPolicy = framework.salaryStagePolicy || {};
  const stages = framework.salaryStages || [];
  return `
    <article class="experience-policy-card">
      <span>經驗值 XP</span>
      <h4>只計入事件管理已驗收成果</h4>
      <p>${escapeHtml(xp.personFormula || "")}</p>
      <small>${escapeHtml(xp.meaning || "")}</small>
    </article>
    <article class="experience-policy-card salary-ladder-card">
      <span>薪資進階階梯</span>
      <h4>綜合門檻須同時達標</h4>
      <div class="salary-stage-list">${stages.slice(1).map((stage) => `
        <div><strong>${escapeHtml(stage.name)}</strong><small>${stage.totalXp} XP · 主能力 ${stage.minimumPrimaryIndex} · AI ${stage.minimumIndexes?.ai || 0} · 馴錢師 ${stage.minimumIndexes?.xunqianshi || 0}</small></div>`).join("")}</div>
      <p>${escapeHtml(salaryPolicy.principle || "")}</p>
    </article>`;
}

function capabilityStageLabel(value) {
  return ({ L1: "基礎執行", L2: "獨立判斷", L3: "規劃覆核" })[value] || value || "待確認";
}

function deriveCapabilityEvidence(person) {
  const domains = state.datasets.capabilities?.domains || [];
  const hoursFor100 = toNumber(state.datasets.capabilities?.scoringPolicy?.hoursFor100) || 40;
  const result = [];
  for (const domain of domains) {
    const signalWeights = new Map((domain.evidenceSignals || []).map((signal) => (
      typeof signal === "string" ? [signal, 1] : [signal.category, toNumber(signal.weight) || 1]
    )));
    const weightedMinutes = (person.history?.topWorkSignals || []).reduce((sum, signal) => (
      sum + (toNumber(signal.minutes) * (signalWeights.get(signal.category) || 0))
    ), 0);
    const weightedHours = weightedMinutes / 60;
    const index = weightedHours > 0
      ? Math.round(Math.min(100, Math.sqrt(weightedHours / hoursFor100) * 100))
      : 0;
    result.push({
      id: domain.id,
      name: domain.name,
      minutes: weightedMinutes,
      index,
      evidenceLabel: capabilityEvidenceLabel(index),
      xp: Math.round(weightedHours * 10),
    });
  }
  return result;
}

function getExperienceProfile(person, evidence = deriveCapabilityEvidence(person)) {
  const framework = state.datasets.capabilities || {};
  const stages = framework.salaryStages || [];
  const policy = framework.salaryStagePolicy || {};
  const indexMap = new Map(evidence.map((item) => [item.id, item.index]));
  const primaryIds = policy.primaryDomains || ["social_work", "finance", "xunqianshi"];
  const primary = primaryIds
    .map((id) => evidence.find((item) => item.id === id))
    .filter(Boolean)
    .sort((a, b) => b.index - a.index)[0] || { id: "", name: "待累積", index: 0 };
  const eventReadiness = getEventExperienceReadiness();
  const eventRecord = eventReadiness.map.get(String(person.id)) || null;
  const xpReady = eventReadiness.ready;
  const totalXp = eventRecord ? Math.round(eventRecord.verifiedMinutes / 6) : 0;
  const historicalReferenceXp = Math.round(toNumber(person.history?.totalHours) * 10);
  const meetsStage = (stage) => {
    const domainRule = stage.minimumDomainCount || { threshold: 0, count: 0 };
    const domainCount = evidence.filter((item) => item.index >= toNumber(domainRule.threshold)).length;
    return totalXp >= toNumber(stage.totalXp)
      && primary.index >= toNumber(stage.minimumPrimaryIndex)
      && Object.entries(stage.minimumIndexes || {}).every(([id, minimum]) => toNumber(indexMap.get(id)) >= toNumber(minimum))
      && domainCount >= toNumber(domainRule.count);
  };
  if (!xpReady) {
    return {
      totalXp,
      historicalReferenceXp,
      eventRecord,
      xpReady,
      primary,
      candidateStage: { name: "待事件核對" },
      nextStage: null,
      gap: "事件全量對帳完成後才計算",
    };
  }
  const candidateStageIndex = Math.max(0, ...stages.map((stage, index) => meetsStage(stage) ? index : -1));
  const candidateStage = stages[candidateStageIndex] || { name: "經驗累積期" };
  const nextStage = stages[candidateStageIndex + 1] || null;
  return {
    totalXp,
    historicalReferenceXp,
    eventRecord,
    xpReady,
    primary,
    candidateStage,
    nextStage,
    gap: nextStage ? buildSalaryStageGap(nextStage, totalXp, primary.index, evidence) : "已達最高量化審查階段",
  };
}

function buildSalaryStageGap(stage, totalXp, primaryIndex, evidence) {
  const indexMap = new Map(evidence.map((item) => [item.id, item.index]));
  const domainNames = new Map((state.datasets.capabilities?.domains || []).map((domain) => [domain.id, domain.name]));
  const gaps = [];
  if (totalXp < toNumber(stage.totalXp)) gaps.push(`XP 尚差 ${toNumber(stage.totalXp) - totalXp}`);
  if (primaryIndex < toNumber(stage.minimumPrimaryIndex)) gaps.push(`主能力尚差 ${toNumber(stage.minimumPrimaryIndex) - primaryIndex}`);
  Object.entries(stage.minimumIndexes || {}).forEach(([id, minimum]) => {
    const current = toNumber(indexMap.get(id));
    if (current < toNumber(minimum)) gaps.push(`${domainNames.get(id) || id}尚差 ${toNumber(minimum) - current}`);
  });
  const domainRule = stage.minimumDomainCount || { threshold: 0, count: 0 };
  const domainCount = evidence.filter((item) => item.index >= toNumber(domainRule.threshold)).length;
  if (domainCount < toNumber(domainRule.count)) gaps.push(`達 ${domainRule.threshold} 分的知能尚差 ${toNumber(domainRule.count) - domainCount} 類`);
  return gaps.length ? gaps.join("、") : "量化門檻已達；品質閘門待人工確認";
}

function capabilityEvidenceLabel(index) {
  const labels = state.datasets.capabilities?.scoringPolicy?.labels || [];
  return [...labels]
    .sort((a, b) => toNumber(b.minimum) - toNumber(a.minimum))
    .find((item) => index >= toNumber(item.minimum))?.label || "尚無證據";
}

function getTaskCapabilityProfile(task) {
  return state.datasets.capabilities?.jobProfiles?.[task.categoryId] || null;
}

function rankPeopleForTask(task) {
  const profile = getTaskCapabilityProfile(task);
  if (!profile) return [];
  const capacityMap = getCapacityMap();
  return (state.datasets.interns?.interns || [])
    .filter((person) => person.status === "active")
    .map((person) => {
      const evidence = deriveCapabilityEvidence(person);
      const indexMap = new Map(evidence.map((item) => [item.id, item.index]));
      const score = Math.round(Object.entries(profile.weights || {})
        .reduce((sum, [domainId, weight]) => sum + (toNumber(indexMap.get(domainId)) * toNumber(weight)), 0));
      return {
        id: person.id,
        safeName: maskName(person.displayName || "未命名"),
        safeEmail: person.maskedEmail || "Email 未提供",
        score,
        capacity: capacityMap.get(String(person.id)) || null,
      };
    })
    .filter((person) => person.score > 0)
    .sort((a, b) => b.score - a.score || toNumber(b.capacity?.availableHours) - toNumber(a.capacity?.availableHours))
    .slice(0, 3);
}

function renderTaskCapabilityMatches(task) {
  const profile = getTaskCapabilityProfile(task);
  if (!profile) return `
    <section class="task-match-panel">
      <div class="task-match-head"><span>知能適配</span><strong>需先補工作知能標籤</strong></div>
      <p>此工作類型尚無安全的知能權重，不自動產生人選排序。</p>
    </section>`;
  const domains = new Map((state.datasets.capabilities?.domains || []).map((domain) => [domain.id, domain.name]));
  const candidates = rankPeopleForTask(task);
  return `
    <section class="task-match-panel">
      <div class="task-match-head"><span>知能適配候選</span><strong>${escapeHtml(profile.name)}</strong></div>
      <div class="task-match-requirements">${Object.entries(profile.weights || {}).map(([domainId, weight]) => `
        <span>${escapeHtml(domains.get(domainId) || domainId)} ${Math.round(toNumber(weight) * 100)}%</span>`).join("")}</div>
      <div class="task-match-list">${candidates.length ? candidates.map((person, index) => `
        <div>
          <strong>${index + 1}. ${escapeHtml(person.safeName)}</strong>
          <span>${escapeHtml(person.safeEmail)}</span>
          <b>適配 ${person.score}</b>
          <small>${person.capacity ? `本週可用 ${numberFormat.format(person.capacity.availableHours)} 小時` : "本週容量待確認"}</small>
        </div>`).join("") : "<p>目前沒有可追溯的相關工作證據。</p>"}</div>
      <p>${escapeHtml(profile.note || "")} 指數只供人工選人前比較，不會自動派工。</p>
    </section>`;
}

function renderPeopleGrid() {
  const capacityMap = getCapacityMap();
  const people = [...(state.datasets.interns?.interns || [])]
    .filter((person) => person.status === "active")
    .map((person) => ({
      ...person,
      safeName: maskName(person.displayName || "未命名"),
      safeEmail: person.maskedEmail || "Email 未提供",
      hours: toNumber(person.workHoursThisMonth),
      capacity: capacityMap.get(String(person.id)) || null,
    }))
    .filter((person) => !state.peopleSearch || [person.safeName, person.safeEmail]
      .some((value) => value.toLowerCase().includes(state.peopleSearch)))
    .sort((a, b) => {
      return a.hours - b.hours;
    });

  const target = document.querySelector("#peopleGrid");
  if (!people.length) {
    target.innerHTML = '<div class="empty-state">找不到符合條件的成員。</div>';
    return;
  }

  target.innerHTML = people.map((person) => {
    const canEvaluate = Boolean(person.capacity);
    const evidence = deriveCapabilityEvidence(person);
    const evidencedCount = evidence.filter((item) => item.index > 0).length;
    const experience = getExperienceProfile(person, evidence);
    return `
      <article class="person-card">
        <div class="person-card-top">
          <div class="person-identity">
            <div class="person-avatar" aria-hidden="true">${escapeHtml(person.safeName.slice(0, 1))}</div>
            <div>
              <div class="person-name-line"><h3>${escapeHtml(person.safeName)}</h3><span>${escapeHtml(person.safeEmail)}</span></div>
              <p>${escapeHtml(person.currentRole || "工讀生")}</p>
            </div>
          </div>
          <span class="status-pill ${evidencedCount ? "good" : "neutral"}">${evidencedCount ? `${evidencedCount}/4 類有證據` : "證據待補"}</span>
        </div>
        <div class="person-facts">
          <div class="person-fact"><span>本週可用</span><strong>${person.capacity ? `${numberFormat.format(person.capacity.availableHours)} 小時` : "待回填"}</strong></div>
          <div class="person-fact"><span>能力判定</span><strong>待人工確認</strong></div>
        </div>
        <div class="experience-summary">
          <div><span>事件確認 XP</span><strong>${!experience.xpReady
            ? "待事件核對"
            : experience.eventRecord
              ? `${numberFormat.format(experience.totalXp)} XP`
              : "0 XP／尚無合格事件"}</strong></div>
          <div><span>主能力證據</span><strong>${escapeHtml(experience.primary.name)} ${experience.primary.index}</strong></div>
          <div><span>量化候選</span><strong>${escapeHtml(experience.candidateStage.name)}</strong></div>
          <small>${!experience.xpReady
            ? `歷史投入參考：${numberFormat.format(experience.historicalReferenceXp)} XP（不列入級距）`
            : experience.eventRecord
              ? `下一階段：${escapeHtml(experience.gap)}`
              : "完整對帳已完成；目前尚無符合 SUCCESS、已關閉且分鐘可解析的事件。"}</small>
        </div>
        <div class="capability-index-grid">${evidence.map((item) => `
          <div class="capability-index-item">
            <div><span>${escapeHtml(item.name)}</span><strong>${item.index}</strong></div>
            <div class="capability-index-track" aria-label="${escapeHtml(item.name)}知能證據指數 ${item.index}"><i style="width:${item.index}%"></i></div>
            <small>${escapeHtml(item.evidenceLabel)} · ${numberFormat.format(item.xp)} XP</small>
          </div>`).join("")}</div>
        <p>${canEvaluate ? "容量已回填；可搭配工作知能權重進入人工選人。" : "量化候選不等於調薪核准；本週容量與品質閘門仍需另行確認。"}</p>
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

  overview.innerHTML = state.recommendations.slice(0, 3).map((item, index) => `
    <article class="recommendation-card">
      <span class="status-pill ${priorityClass(item.priority)}">${priorityLabel(item.priority)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="recommendation-action">下一步：${escapeHtml(item.action)}</div>
      ${item.details?.length ? `<button class="recommendation-detail-button" type="button" data-recommendation-detail="${index}">查看 ${item.details.length} 筆明細</button>` : ""}
    </article>`).join("");

  full.innerHTML = state.recommendations.map((item, index) => `
    <article class="recommendation-item ${item.priority === "high" ? "is-high" : ""}">
      <div class="recommendation-rank">${index + 1}</div>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="recommendation-reason">原因：${escapeHtml(item.reason)}</div>
        ${item.details?.length ? `<button class="recommendation-detail-button" type="button" data-recommendation-detail="${index}">查看 ${item.details.length} 筆明細</button>` : ""}
      </div>
      <span class="status-pill ${priorityClass(item.priority)}">${priorityLabel(item.priority)}</span>
    </article>`).join("");

  document.querySelectorAll("[data-recommendation-detail]").forEach((button) => {
    button.addEventListener("click", () => openRecommendationDetail(Number(button.dataset.recommendationDetail)));
  });
}

function renderNotifications() {
  const summary = document.querySelector("#notificationSummary");
  const target = document.querySelector("#notificationList");
  const dataset = state.datasets.notifications;
  const items = Array.isArray(dataset?.items) ? dataset.items : [];
  const openItems = items.filter((item) => item.status !== "resolved");
  const urgentItems = openItems.filter((item) => item.severity === "urgent");

  summary.innerHTML = `
    <article><span>未結提醒</span><strong>${openItems.length}</strong><small>仍需追蹤或確認</small></article>
    <article><span>優先處理</span><strong>${urgentItems.length}</strong><small>影響本週工作判斷</small></article>
    <article><span>固定提醒</span><strong>${escapeHtml(dataset?.meta?.scheduleLabel || "未設定")}</strong><small>${escapeHtml(dataset?.meta?.timezone || "Asia/Taipei")}</small></article>`;

  if (!items.length) {
    target.innerHTML = '<div class="empty-state">目前沒有可用的提醒資料。</div>';
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="notification-item ${escapeHtml(item.severity || "info")}">
      <div class="notification-marker" aria-hidden="true"></div>
      <div class="notification-content">
        <div class="notification-head">
          <div>
            <span class="notification-category">${escapeHtml(item.category || "一般通知")}</span>
            <h3>${escapeHtml(item.title || "未命名提醒")}</h3>
          </div>
          <span class="status-pill ${notificationStatusClass(item.status)}">${escapeHtml(notificationStatusLabel(item.status))}</span>
        </div>
        <p>${escapeHtml(item.summary || "")}</p>
        <dl class="notification-meta">
          <div><dt>時間</dt><dd>${escapeHtml(item.when || "未設定")}</dd></div>
          <div><dt>下一步</dt><dd>${escapeHtml(item.nextAction || "持續觀察")}</dd></div>
        </dl>
        ${item.link ? `<a class="text-button notification-link" href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.linkLabel || "開啟處理頁面")}</a>` : ""}
      </div>
    </article>`).join("");
}

function notificationStatusLabel(status) {
  return status === "resolved" ? "已完成" : status === "scheduled" ? "已排程" : status === "approval" ? "待核准" : "待處理";
}

function notificationStatusClass(status) {
  return status === "resolved" ? "good" : status === "scheduled" ? "neutral" : status === "approval" ? "warning" : "danger";
}

function openRecommendationDetail(index) {
  const item = state.recommendations[index];
  if (!item?.details?.length) return;
  state.activeRecommendationIndex = index;
  document.querySelector("#recommendationDetailTitle").textContent = item.title;
  const detailBoundary = item.taskFilter
    ? "公開摘要不保存原始工作標題或 InfoCenter 原始 ID；請用公開代碼、類型、期限、狀態與人員標記交叉查找，確認後再修改。"
    : "人員只顯示匿名代碼；請先確認來源與目前狀態，再到對應系統修改。";
  document.querySelector("#recommendationDetailSummary").textContent = `共 ${item.details.length} 筆。${detailBoundary}`;
  document.querySelector("#recommendationDetailBody").innerHTML = item.details.map((detail, detailIndex) => `
    <article class="recommendation-detail-row">
      <div class="recommendation-detail-index">${detailIndex + 1}</div>
      <div class="recommendation-detail-content">
        <div class="recommendation-detail-head">
          <h3>${escapeHtml(detail.title)}</h3>
          <span>${escapeHtml(detail.key)}</span>
        </div>
        <div class="recommendation-detail-meta">${(detail.meta || []).map((meta) => `<span>${escapeHtml(meta)}</span>`).join("")}</div>
        <div class="recommendation-change"><span>建議確認／修改</span><p>${escapeHtml(detail.change)}</p></div>
      </div>
    </article>`).join("");

  const goToTasks = document.querySelector("#goToRecommendationTasks");
  goToTasks.hidden = !item.taskFilter;
  const systemLink = document.querySelector("#recommendationSystemLink");
  const target = item.taskFilter ? "work" : item.systemTarget;
  const targetMap = {
    work: { href: "https://www.egroup-infocenter.com/me/work?tab=list", label: "開啟 InfoCenter 工作清單" },
    people: { href: "https://www.egroup-infocenter.com/me/crm/users", label: "開啟 InfoCenter 人員清單" },
    event: { href: "https://www.egroup-infocenter.com/me/event/events", label: "開啟 InfoCenter 事件清單" },
  };
  const destination = targetMap[target];
  systemLink.hidden = !destination;
  if (destination) {
    systemLink.href = destination.href;
    systemLink.textContent = destination.label;
  }
  document.querySelector("#recommendationDetailDialog").showModal();
}

async function copyActiveRecommendationDetail() {
  const item = state.recommendations[state.activeRecommendationIndex];
  if (!item?.details?.length) return;
  const lines = [
    `# ${item.title}`,
    `- 原因：${item.reason}`,
    `- 建議：${item.action}`,
    `- 明細：${item.details.length} 筆`,
    "- 查找限制：公開摘要沒有 InfoCenter 原始 ID，請用代碼、類型、期限與狀態交叉確認。",
    "",
    ...item.details.flatMap((detail, index) => [
      `- [ ] ${index + 1}. ${detail.title}（${detail.key}）`,
      `  - 現況：${(detail.meta || []).join("；")}`,
      `  - 建議確認／修改：${detail.change}`,
    ]),
  ];
  await copyText(lines.join("\n"), `${item.details.length} 筆修正明細已複製`);
}

function goToActiveRecommendationTasks() {
  const item = state.recommendations[state.activeRecommendationIndex];
  if (!item?.taskFilter) return;
  document.querySelector("#recommendationDetailDialog").close();
  setTaskFilter(item.taskFilter);
  showView("dispatch");
}

function updateNavigationCounts() {
  document.querySelector("#navDispatchCount").textContent = String(state.datasets.workSummary?.summary?.unassigned
    ?? state.tasks.filter((task) => !task.done).length);
  document.querySelector("#navRecommendationCount").textContent = String(state.recommendations.length);
  const notifications = state.datasets.notifications?.items || [];
  document.querySelector("#navNotificationCount").textContent = String(notifications.filter((item) => item.status !== "resolved").length);
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
  const capacity = getCapacityStats();
  const ownerConflicts = state.tasks.filter((task) => getTaskIssueType(task) === "owner_conflict").length;
  const statusReviews = state.tasks.filter((task) => getTaskIssueType(task) === "status_review").length;
  const brief = [
    "# 工讀生總工作藍圖摘要",
    `- InfoCenter 掃描：${summary.scannedWorks || 0} 筆工作`,
    `- 未完成：${summary.active || 0} 筆（待派 ${summary.unassigned || 0}、進行中 ${summary.inProgress || 0}）`,
    `- 已完成：${summary.completed || 0} 筆`,
    `- 逾期未完成：${summary.overdue || 0} 筆`,
    `- 狀態需確認：進行中但無人員 ${ownerConflicts} 筆；已有主責與事件但仍待開始 ${statusReviews} 筆`,
    `- 人員涵蓋率：${Math.round(toNumber(summary.assignmentCoverageRate) * 100)}%`,
    `- 工時依據：${summary.timeReportCount || 0} 筆評論回報，未完成工作 P80 約 ${numberFormat.format(summary.totalEstimatedHoursP80 || 0)} 小時`,
    `- Active 成員：${interns.active || 0} 位`,
    `- 本週容量：${capacity.covered}/${capacity.activeCount} 位已回填，合計 ${numberFormat.format(capacity.availableHours)} 小時`,
    `- 建議事項：${state.recommendations.length} 筆`,
    "",
    "## 優先建議",
    ...state.recommendations.slice(0, 5).map((item) => `- ${item.title}：${item.action}`),
    "",
    "注意：未回填本週容量或能力證據尚未人工確認的人員，不列入可派候選；正式派工、驗收與派薪請回到 InfoCenter。",
  ].join("\n");
  await copyText(brief, "管理摘要已複製");
}

async function copyRecommendationList() {
  const text = state.recommendations.map((item, index) => `${index + 1}. ${item.title}\n   下一步：${item.action}\n   原因：${item.reason}`).join("\n\n");
  await copyText(text || "目前沒有建議事項。", "建議清單已複製");
}

async function copyNotificationList() {
  const items = state.datasets.notifications?.items || [];
  const text = items.map((item) => `- [${notificationStatusLabel(item.status)}] ${item.title}\n  時間：${item.when || "未設定"}\n  下一步：${item.nextAction || "持續觀察"}`).join("\n\n");
  await copyText(text || "目前沒有提醒與通知。", "提醒摘要已複製");
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
  if (/^Member-[A-Z0-9]{4,}$/i.test(name)) return name;
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
