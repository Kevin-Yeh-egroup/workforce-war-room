const DATA_PATHS = {
  interns: "./data/interns.public.json",
  radar: "./data/radar-week.json",
  tracking: "./data/radar-tracking.json",
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
  workSummaryReadiness: { ready: false, reason: "missing", label: "尚未讀取" },
  workModel: null,
};

const numberFormat = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    bindNavigation();
    bindControls();
    loadDashboard();
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 讀取失敗（${response.status}）`);
  return response.json();
}

async function loadDashboard() {
  setLoadingState();
  state.errors = [];

  const loaders = {
    interns: fetchJson(DATA_PATHS.interns),
    radar: fetchJson(DATA_PATHS.radar),
    tracking: fetchJson(DATA_PATHS.tracking),
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

  state.workSummaryReadiness = inspectInfoCenterWorkSummary(state.datasets.workSummary);
  state.workModel = state.workSummaryReadiness.ready
    ? projectInfoCenterWorkSummary(state.datasets.workSummary)
    : null;
  state.tasks = state.workSummaryReadiness.ready
    ? normalizeInfoCenterWorkItems(state.datasets.workSummary)
    : [];
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

const REQUIRED_LEGACY_WORK_SUMMARY_COUNTS = [
  "scannedWorks",
  "active",
  "pending",
  "inProgress",
  "completed",
  "unassigned",
  "overdue",
  "assignmentCoverageCount",
  "assignmentCoverageRate",
  "estimateEvidenceCoverageCount",
  "estimateEvidenceCoverageRate",
  "timeReportCount",
  "totalEstimatedHoursP80",
];

const V2_READY_PUBLICATION_STATUSES = new Set(["ready_complete", "ready_partial_result_evidence"]);
const V2_COVERAGE_STATUSES = new Set(["complete", "partial", "none"]);
const V2_WORK_STATUSES = new Set(["pending", "in_progress", "revision", "completed", "cancelled"]);
const V2_ASSIGNMENT_STATES = new Set(["assigned", "unassigned", "not_applicable"]);
const V2_OUTCOME_STATES = new Set([
  "work_completed", "cancelled", "needs_revision", "in_review", "accepted_event_visible",
  "activity_visible", "outside_observed_window", "no_linked_events", "unknown",
]);

function isV2InfoCenterWorkSummary(dataset) {
  return dataset?.meta?.schemaVersion === "2.0.0";
}

function inspectInfoCenterWorkSummary(dataset) {
  if (!dataset || typeof dataset !== "object") {
    return { ready: false, reason: "missing", label: "InfoCenter 工作摘要未讀取" };
  }
  return isV2InfoCenterWorkSummary(dataset)
    ? inspectV2InfoCenterWorkSummary(dataset)
    : inspectLegacyInfoCenterWorkSummary(dataset);
}

function inspectLegacyInfoCenterWorkSummary(dataset) {
  if (dataset.meta?.source?.liveWorkFeedConnected === false) {
    return { ready: false, reason: "disconnected", label: "最近一次 InfoCenter 快照擷取未連線" };
  }
  if (!dataset.summary || typeof dataset.summary !== "object" || !Array.isArray(dataset.workItems)) {
    return { ready: false, reason: "invalid", label: "InfoCenter 工作摘要格式不完整" };
  }
  const invalidCount = REQUIRED_LEGACY_WORK_SUMMARY_COUNTS.find((key) => {
    const value = Number(dataset.summary[key]);
    return !Number.isFinite(value) || value < 0;
  });
  if (invalidCount) {
    return { ready: false, reason: "invalid", label: `InfoCenter 工作摘要欄位 ${invalidCount} 無效` };
  }
  const scannedWorks = Number(dataset.summary.scannedWorks);
  const active = Number(dataset.summary.active);
  const pending = Number(dataset.summary.pending);
  const inProgress = Number(dataset.summary.inProgress);
  const completed = Number(dataset.summary.completed);
  const unassigned = Number(dataset.summary.unassigned);
  const overdue = Number(dataset.summary.overdue);
  const assignmentCoverageCount = Number(dataset.summary.assignmentCoverageCount);
  const assignmentCoverageRate = Number(dataset.summary.assignmentCoverageRate);
  const estimateEvidenceCoverageCount = Number(dataset.summary.estimateEvidenceCoverageCount);
  const estimateEvidenceCoverageRate = Number(dataset.summary.estimateEvidenceCoverageRate);
  const revision = Number(dataset.summary.revision || 0);
  if (!Number.isFinite(revision) || revision < 0
    || active !== pending + inProgress + revision
    || scannedWorks !== active + completed
    || dataset.workItems.length !== scannedWorks
    || unassigned + assignmentCoverageCount !== active
    || overdue > active
    || estimateEvidenceCoverageCount > active
    || assignmentCoverageRate > 1
    || estimateEvidenceCoverageRate > 1) {
    return { ready: false, reason: "invalid", label: "InfoCenter 工作摘要筆數或狀態加總不一致" };
  }
  const publicIds = dataset.workItems.map((item) => String(item?.id || "").trim());
  if (publicIds.some((id) => !id) || new Set(publicIds).size !== publicIds.length) {
    return { ready: false, reason: "invalid", label: "InfoCenter 工作摘要含空白或重複公開代碼" };
  }
  const workStatusCounts = dataset.workItems.reduce((counts, item) => {
    const status = String(item?.status || "");
    if (["completed", "cancelled"].includes(status)) counts.completed += 1;
    if (status === "pending") counts.pending += 1;
    if (status === "in_progress") counts.inProgress += 1;
    if (status === "revision") counts.revision += 1;
    return counts;
  }, { completed: 0, pending: 0, inProgress: 0, revision: 0 });
  if (workStatusCounts.completed !== completed
    || workStatusCounts.pending !== pending
    || workStatusCounts.inProgress !== inProgress
    || workStatusCounts.revision !== revision) {
    return { ready: false, reason: "invalid", label: "InfoCenter 工作明細與摘要狀態不一致" };
  }
  if (!dataset.meta?.generatedAt || !parseDate(dataset.meta.generatedAt)) {
    return { ready: false, reason: "invalid", label: "InfoCenter 工作摘要缺少有效截止時間" };
  }
  return {
    ready: true,
    reason: "ready",
    label: "最近一次 InfoCenter 已驗證快照可用",
    generatedAt: dataset.meta.generatedAt,
    organizationMarker: "已核對組織",
    schemaFamily: "legacy-v1",
  };
}

function inspectV2InfoCenterWorkSummary(dataset) {
  const meta = dataset.meta;
  const summary = dataset.summary;
  if (!V2_READY_PUBLICATION_STATUSES.has(meta?.publicationStatus)) {
    return { ready: false, reason: "blocked", label: "InfoCenter v2 快照尚未通過發布閘門" };
  }
  if (!parseDate(meta.sourceFetchedAt)
    || meta.source?.system !== "InfoCenter"
    || meta.source?.organizationProof?.labelMatched !== true
    || meta.source?.organizationProof?.idHashMatched !== true
    || meta.source?.workCoverage?.status !== "complete"
    || !isNonNegativeInteger(meta.source?.workCoverage?.scannedWorks)
    || !isNonNegativeInteger(meta.source?.workCoverage?.uniqueWorkIds)
    || meta.source?.workCoverage?.duplicateWorkIds !== 0
    || meta.source?.workCoverage?.missingWorkIds !== 0
    || !isNonNegativeInteger(meta.source?.workCoverage?.unknownLifecycleStatuses)
    || meta.source?.workCoverage?.unknownLifecycleStatuses !== 0
    || !isNonNegativeInteger(meta.source?.workCoverage?.assignmentEvidenceErrors)
    || meta.source?.workCoverage?.assignmentEvidenceErrors !== 0) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 來源或組織證明不完整" };
  }
  if (!summary || !Array.isArray(dataset.workItems)
    || !isNonNegativeInteger(summary.scannedWorks)
    || !isNonNegativeInteger(summary.active)
    || !isNonNegativeInteger(summary.pending)
    || !isNonNegativeInteger(summary.inProgress)
    || !isNonNegativeInteger(summary.revision)
    || !isNonNegativeInteger(summary.completed)
    || !isNonNegativeInteger(summary.cancelled)
    || !isNonNegativeInteger(summary.overdue)
    || !isNonNegativeInteger(summary.timeReportCount)) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 摘要格式不完整" };
  }
  if (summary.active !== summary.pending + summary.inProgress + summary.revision
    || summary.scannedWorks !== summary.active + summary.completed + summary.cancelled
    || summary.overdue > summary.active
    || dataset.workItems.length !== summary.scannedWorks
    || meta.source.workCoverage.scannedWorks !== summary.scannedWorks
    || meta.source.workCoverage.uniqueWorkIds !== summary.scannedWorks) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 工作筆數或生命週期加總不一致" };
  }

  const assignment = summary.assignment;
  const resultEvidence = summary.resultEvidence;
  const estimateEvidence = summary.estimateEvidence;
  if (!assignment
    || assignment.provenance !== "infocenter_assignment_tag"
    || assignment.provisional !== true
    || !isNonNegativeInteger(assignment.applicable)
    || !isNonNegativeInteger(assignment.assigned)
    || !isNonNegativeInteger(assignment.unassigned)
    || assignment.assigned + assignment.unassigned !== assignment.applicable
    || assignment.applicable !== summary.active
    || !isRateOrNull(assignment.coverageRate)
    || !rateMatches(assignment.coverageRate, assignment.assigned, assignment.applicable)) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 人力標記摘要不一致" };
  }
  if (!resultEvidence
    || !V2_COVERAGE_STATUSES.has(resultEvidence.coverageStatus)
    || !isNonNegativeInteger(resultEvidence.worksComplete)
    || !isNonNegativeInteger(resultEvidence.worksPartial)
    || !isNonNegativeInteger(resultEvidence.worksNone)
    || resultEvidence.worksComplete + resultEvidence.worksPartial + resultEvidence.worksNone !== summary.scannedWorks
    || !isRateOrNull(resultEvidence.coverageRate)
    || !rateMatches(resultEvidence.coverageRate, resultEvidence.worksComplete, summary.scannedWorks)) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 工作結果證據摘要不一致" };
  }
  if (!estimateEvidence
    || !isNonNegativeInteger(estimateEvidence.covered)
    || !isNonNegativeInteger(estimateEvidence.applicable)
    || estimateEvidence.covered > estimateEvidence.applicable
    || estimateEvidence.applicable !== summary.active
    || !isRateOrNull(estimateEvidence.coverageRate)
    || !rateMatches(estimateEvidence.coverageRate, estimateEvidence.covered, estimateEvidence.applicable)) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 估時證據摘要不一致" };
  }

  const aliases = new Set();
  const lifecycleCounts = { pending: 0, in_progress: 0, revision: 0, completed: 0, cancelled: 0 };
  const assignmentCounts = { assigned: 0, unassigned: 0, applicable: 0 };
  const resultCounts = { complete: 0, partial: 0, none: 0 };
  for (const item of dataset.workItems) {
    const alias = String(item?.alias || "").trim();
    const lifecycle = item?.lifecycle;
    const itemAssignment = item?.assignment;
    const outcome = item?.outcome;
    if (!/^W-[A-F0-9]{8}$/.test(alias) || aliases.has(alias)
      || !lifecycle || lifecycle.provenance !== "infocenter_work_status" || !V2_WORK_STATUSES.has(lifecycle.status)
      || !itemAssignment || !V2_ASSIGNMENT_STATES.has(itemAssignment.state)
      || itemAssignment.provenance !== "infocenter_assignment_tag"
      || itemAssignment.provisional !== true
      || !isNonNegativeInteger(itemAssignment.observedTagCount)
      || typeof itemAssignment.appliesToDispatch !== "boolean"
      || !outcome || !V2_OUTCOME_STATES.has(outcome.state) || !V2_COVERAGE_STATUSES.has(outcome.coverage)
      || !isNullableNonNegativeInteger(outcome.declaredEventCount)
      || !isNullableNonNegativeInteger(outcome.observedEventCount)
      || !isNullableInteger(outcome.eventCountDelta)
      || typeof outcome.lowerBound !== "boolean"
      || !item.estimate
      || !isNullableFiniteNonNegative(item.estimate.p50Hours)
      || !isNullableFiniteNonNegative(item.estimate.p80Hours)
      || !isNonNegativeInteger(item.estimate.sampleCount)
      || !item.requirements || !Array.isArray(item.requirements.skills)) {
      return { ready: false, reason: "invalid", label: "InfoCenter v2 工作明細格式無效" };
    }
    if ((!itemAssignment.appliesToDispatch && itemAssignment.state !== "not_applicable")
      || (itemAssignment.appliesToDispatch && itemAssignment.state === "not_applicable")
      || (itemAssignment.state === "assigned" && itemAssignment.observedTagCount < 1)
      || (itemAssignment.state === "unassigned" && itemAssignment.observedTagCount !== 0)
      || (outcome.coverage === "none" && outcome.counts !== null)
      || (outcome.counts !== null && (!isV2OutcomeCounts(outcome.counts)
        || outcome.counts.observedEvents !== outcome.observedEventCount))
      || (outcome.declaredEventCount !== null && outcome.observedEventCount !== null
        && outcome.eventCountDelta !== outcome.declaredEventCount - outcome.observedEventCount)) {
      return { ready: false, reason: "invalid", label: "InfoCenter v2 派案或成果證據語意無效" };
    }
    aliases.add(alias);
    lifecycleCounts[lifecycle.status] += 1;
    if (itemAssignment.appliesToDispatch) {
      assignmentCounts.applicable += 1;
      assignmentCounts[itemAssignment.state] += 1;
    }
    resultCounts[outcome.coverage] += 1;
  }
  if (lifecycleCounts.pending !== summary.pending
    || lifecycleCounts.in_progress !== summary.inProgress
    || lifecycleCounts.revision !== summary.revision
    || lifecycleCounts.completed !== summary.completed
    || lifecycleCounts.cancelled !== summary.cancelled
    || assignmentCounts.applicable !== assignment.applicable
    || assignmentCounts.assigned !== assignment.assigned
    || assignmentCounts.unassigned !== assignment.unassigned
    || resultCounts.complete !== resultEvidence.worksComplete
    || resultCounts.partial !== resultEvidence.worksPartial
    || resultCounts.none !== resultEvidence.worksNone) {
    return { ready: false, reason: "invalid", label: "InfoCenter v2 摘要與工作明細無法對帳" };
  }
  return {
    ready: true,
    reason: "ready",
    label: "最近一次 InfoCenter v2 已驗證快照可用",
    generatedAt: meta.sourceFetchedAt,
    organizationMarker: "已核對組織",
    schemaFamily: "v2",
    resultCoverageStatus: resultEvidence.coverageStatus,
  };
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value) {
  return value === null || isNonNegativeInteger(value);
}

function isNullableInteger(value) {
  return value === null || Number.isInteger(value);
}

function isRateOrNull(value) {
  return value === null || Number.isFinite(value) && value >= 0 && value <= 1;
}

function rateMatches(rate, numerator, denominator) {
  if (denominator === 0) return rate === null;
  return Number.isFinite(rate) && Math.abs(rate - numerator / denominator) <= 0.001;
}

function isNullableFiniteNonNegative(value) {
  return value === null || Number.isFinite(value) && value >= 0;
}

function isV2OutcomeCounts(counts) {
  return ["observedEvents", "reviewSuccess", "reviewReject", "reviewProcessing", "unreviewed", "open", "closed", "unknownLifecycle"]
    .every((key) => isNonNegativeInteger(counts[key]));
}

function projectInfoCenterWorkSummary(dataset) {
  if (!inspectInfoCenterWorkSummary(dataset).ready) return null;
  if (!isV2InfoCenterWorkSummary(dataset)) return dataset;
  const summary = dataset.summary;
  return {
    meta: dataset.meta,
    summary: {
      scannedWorks: summary.scannedWorks,
      active: summary.active,
      pending: summary.pending,
      inProgress: summary.inProgress,
      revision: summary.revision,
      completed: summary.completed,
      cancelled: summary.cancelled,
      unassigned: summary.assignment.unassigned,
      overdue: summary.overdue,
      assignmentCoverageCount: summary.assignment.assigned,
      assignmentCoverageRate: summary.assignment.coverageRate,
      estimateEvidenceCoverageCount: summary.estimateEvidence.covered,
      estimateEvidenceCoverageRate: summary.estimateEvidence.coverageRate,
      resultEvidenceCoverageStatus: summary.resultEvidence.coverageStatus,
      resultEvidenceCoverageRate: summary.resultEvidence.coverageRate,
      timeReportCount: summary.timeReportCount,
      reportedHours: summary.reportedHours,
      totalEstimatedHoursP80: summary.totalEstimatedHoursP80,
      categoryCounts: summary.categoryCounts,
    },
    estimationByCategory: dataset.estimationByCategory,
    workItems: dataset.workItems.map(projectV2WorkItemForDashboard),
  };
}

function projectV2WorkItemForDashboard(item) {
  return {
    id: item.alias,
    label: item.label,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    status: item.lifecycle.status,
    statusLabel: item.lifecycle.statusLabel,
    stage: item.lifecycle.stage,
    createdDate: item.lifecycle.createdDate,
    dueDate: item.lifecycle.dueDate,
    overdue: item.lifecycle.overdue,
    progress: item.lifecycle.progress,
    assignedCount: item.assignment.observedTagCount,
    assignmentState: item.assignment.state,
    assignmentAppliesToDispatch: item.assignment.appliesToDispatch,
    assignmentProvenance: item.assignment.provenance,
    outcome: item.outcome,
    eventCount: item.outcome.declaredEventCount,
    completedEventCount: item.outcome.counts?.reviewSuccess ?? null,
    estimatedHoursP50: item.estimate.p50Hours,
    estimatedHoursP80: item.estimate.p80Hours,
    estimateSampleCount: item.estimate.sampleCount,
    estimateConfidence: item.estimate.confidence,
    estimateSource: item.estimate.source,
    minimumLevel: item.requirements.minimumLevel,
    skills: item.requirements.skills,
  };
}

function normalizeInfoCenterWorkItems(dataset) {
  const model = projectInfoCenterWorkSummary(dataset);
  if (!model) return [];
  return model.workItems.map((item) => {
    const outcome = item.outcome && typeof item.outcome === "object" ? item.outcome : {};
    const outcomeCounts = outcome.counts && typeof outcome.counts === "object" ? outcome.counts : {};
    const done = ["completed", "cancelled"].includes(item.status);
    const assignmentState = item.assignmentState || (done ? "not_applicable" : item.assignedCount > 0 ? "assigned" : "unassigned");
    const assignedCount = Number(item.assignedCount || 0);
    return {
      id: item.id,
      title: item.label || item.categoryName || "匿名工作",
      source: "infocenter",
      done,
      statusKey: item.status,
      status: item.statusLabel || "待確認",
      stage: item.stage || "待確認",
      owner: assignmentState === "not_applicable"
        ? "InfoCenter 人力標記不適用"
        : assignedCount > 0 ? `InfoCenter 人力標記 ${assignedCount} 筆` : "未見 InfoCenter 人力標記",
      assignedCount,
      assignmentState,
      due: item.dueDate || "",
      dueDate: parseDate(item.dueDate),
      overdue: Boolean(item.overdue),
      progress: Number(item.progress || 0),
      category: item.categoryName || "一般營運支援",
      categoryId: item.categoryId || "GENERAL_OPS",
      minimumLevel: item.minimumLevel || "待確認",
      skills: Array.isArray(item.skills) ? item.skills : [],
      estimatedHoursP50: nullableNumber(item.estimatedHoursP50),
      estimatedHoursP80: nullableNumber(item.estimatedHoursP80),
      estimateSampleCount: nullableCount(item.estimateSampleCount),
      estimateConfidence: item.estimateConfidence || "baseline",
      estimateSource: item.estimateSource || "planning-baseline",
      eventCount: nullableCount(item.eventCount),
      completedEventCount: nullableCount(item.completedEventCount),
      resultState: typeof outcome.state === "string" ? outcome.state : typeof item.resultState === "string" ? item.resultState : "unknown",
      resultEvidenceCoverage: V2_COVERAGE_STATUSES.has(outcome.coverage)
        ? outcome.coverage
        : V2_COVERAGE_STATUSES.has(item.resultEvidenceCoverage) ? item.resultEvidenceCoverage : "none",
      observedEventCount: nullableCount(outcome.observedEventCount ?? item.observedEventCount),
      reviewSuccessCount: nullableCount(outcomeCounts.reviewSuccess ?? outcomeCounts.success ?? item.reviewSuccessCount),
      reviewProcessingCount: nullableCount(outcomeCounts.reviewProcessing ?? outcomeCounts.processing ?? item.reviewProcessingCount),
      reviewRejectCount: nullableCount(outcomeCounts.reviewReject ?? outcomeCounts.reject ?? item.reviewRejectCount),
      delegation: assignmentState === "not_applicable"
        ? { type: "not_applicable", label: "工作已結束", className: "neutral" }
        : assignmentState === "assigned"
          ? { type: "covered", label: "已見人力標記", className: "good" }
          : { type: "unassigned", label: "未見人力標記", className: "danger" },
    };
  });
}

function nullableNumber(value) {
  return value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
}

function nullableCount(value) {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function formatNullableCount(value) {
  return value === null || value === undefined ? "—" : `${numberFormat.format(value)} 筆`;
}

function formatNullableHours(value) {
  return value === null || value === undefined ? "—" : `${numberFormat.format(value)} 小時`;
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
    createInfoCenterWorkSourceState(workSummary),
    createSourceState("工讀生公開狀態", interns?.meta?.sourceModifiedAt || interns?.meta?.generatedAt, Boolean(interns)),
    createSourceState("每週工作與雷達", radar?.meta?.generatedAt, Boolean(radar)),
    createSourceState("InfoCenter 工作節奏", rhythm?.meta?.generatedAt, Boolean(rhythm)),
    createSourceState("工作藍圖規格", blueprint?.meta?.updatedAt, Boolean(blueprint)),
    createSourceState("本週可用工時", capacity?.meta?.generatedAt, Boolean(capacity)),
    createEventExperienceSourceState(eventExperience),
  ];
}

function createInfoCenterWorkSourceState(dataset) {
  const readiness = inspectInfoCenterWorkSummary(dataset);
  const date = parseDate(dataset?.meta?.generatedAt);
  if (!readiness.ready) {
    return {
      name: "InfoCenter 派案與工作結果",
      date,
      ageDays: null,
      status: "error",
      label: readiness.label,
      blocking: true,
    };
  }
  const base = createSourceState("InfoCenter 派案與工作結果", dataset.meta.generatedAt, true);
  return {
    ...base,
    organizationMarker: readiness.organizationMarker,
    label: `最近一次已驗證快照・${base.label}`,
  };
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
  if (!task.done && task.statusKey === "in_progress" && task.assignedCount === 0) return "marker_conflict";
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
      `事件：${formatNullableCount(task.eventCount)}`,
      `P80：${formatNullableHours(task.estimatedHoursP80)}`,
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
  const workSummary = state.workModel;
  const tracking = state.datasets.tracking;
  const staleSources = state.sources.filter((source) => source.status === "danger");
  const markerConflictTasks = state.tasks.filter((task) => getTaskIssueType(task) === "marker_conflict");
  const unassignedTasks = state.tasks.filter((task) => !task.done && task.assignedCount === 0);
  const overdueTasks = state.tasks.filter((task) => !task.done && task.overdue);
  const statusReviewTasks = state.tasks.filter((task) => getTaskIssueType(task) === "status_review");
  const capacityMap = getCapacityMap();
  const activePeople = (interns?.interns || []).filter((person) => person.status === "active");
  const missingCapacityPeople = activePeople.filter((person) => !capacityMap.has(String(person.id)));
  const openTrackingItems = (tracking?.items || []).filter(
    (item) => !["done", "resolved"].includes(String(item.status || "").toLowerCase()),
  );

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

  if (!state.workSummaryReadiness.ready) {
    items.push({
      priority: "high",
      title: "恢復 InfoCenter 工作摘要",
      description: "InfoCenter 派案與工作結果目前不可用；核心數字維持未知，也不改用每週清單替代。",
      action: "檢查登入狀態並重新執行 automation-3",
      reason: state.workSummaryReadiness.label,
    });
  }

  const hardConflicts = markerConflictTasks.length;
  if (hardConflicts) {
    items.push({
      priority: "high",
      title: `先確認 ${hardConflicts} 筆「進行中但未見人力標記」工作`,
      description: "InfoCenter 人力標記不是正式主責證明；請回到平台確認實際派案與工作狀態。",
      action: "逐筆確認正式派案與實際狀態，再決定補標記或結案",
      reason: "若只靠標記推定主責，可能產生重複執行與責任不清",
      taskFilter: "conflict",
      details: markerConflictTasks.map((task) => buildTaskRecommendationDetail(
        task,
        "先在 InfoCenter 確認正式派案；續做則補齊人力標記並校正進度，已失效則結案。",
      )),
    });
  }

  const unassigned = unassignedTasks.length;
  if (unassigned) {
    items.push({
      priority: "high",
      title: `處理 ${unassigned} 筆未見 InfoCenter 人力標記的工作`,
      description: "先確認工作仍有效與正式派案狀態，再把能力、估時與人工容量當作輔助資訊。",
      action: "回到 InfoCenter 確認派案、人力標記與期限",
      reason: "公開摘要只有人力標記計數，不能自行推定正式主責",
      taskFilter: "unassigned",
      details: unassignedTasks.map((task) => buildTaskRecommendationDetail(
        task,
        task.statusKey === "in_progress"
          ? "先確認正在執行的人與正式派案；續做則補齊標記，已失效則結案，不要直接重派。"
          : "先確認工作仍有效與正式派案；續做則補齊標記、期限與工作範本，失效則結案。",
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
      title: `釐清 ${statusReview} 筆已見人力標記與事件、但仍顯示待開始的工作`,
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

  const weakCategories = state.workSummaryReadiness.ready
    ? (workSummary?.estimationByCategory || []).filter((item) => ["low", "baseline"].includes(item.confidence))
    : [];
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
  const workReadiness = state.workSummaryReadiness;
  const errors = state.sources.filter((source) => source.status === "error");
  const blocked = state.sources.filter((source) => source.blocking);
  const stale = state.sources.filter((source) => source.status === "danger");

  if (!workReadiness.ready) {
    strip.className = "source-strip is-error";
    strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>${escapeHtml(workReadiness.label)}；派案、工作結果與平台例外維持「—」，不改用每週清單替代。</span>`;
    return;
  }

  if (errors.length) {
    strip.className = "source-strip is-warning";
    strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>InfoCenter 派案來源可用，但另有 ${errors.length} 個輔助來源讀取失敗。</span>`;
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
  strip.innerHTML = `<span class="source-pulse" aria-hidden="true"></span><span>最近一次 InfoCenter 已驗證快照（${escapeHtml(workReadiness.organizationMarker)}）可用；截止 ${escapeHtml(formatDateTime(parseDate(workReadiness.generatedAt)))}。這不是瀏覽器即時狀態。</span>`;
}

function renderMetrics() {
  const ready = state.workSummaryReadiness.ready;
  const summary = ready ? state.workModel.summary : null;

  const metrics = [
    { label: "未見人力標記", value: ready ? summary.unassigned : null, hint: ready ? `未完成 ${summary.active} 筆中；不等同正式未派案` : state.workSummaryReadiness.label, icon: "派" },
    { label: "進行中", value: ready ? summary.inProgress : null, hint: ready ? "依 InfoCenter 工作進度唯讀判定" : "InfoCenter 來源不可用", icon: "進" },
    { label: "已完成", value: ready ? summary.completed : null, hint: ready ? `本次掃描 ${summary.scannedWorks} 筆；不推定事件驗收結果` : "InfoCenter 來源不可用", icon: "完" },
    { label: "逾期未完成", value: ready ? summary.overdue : null, hint: ready ? "由同一份 InfoCenter 摘要產生例外" : "InfoCenter 來源不可用", icon: "期" },
  ];

  document.querySelector("#metricGrid").innerHTML = metrics.map((metric) => `
    <article class="metric-card">
      <div class="metric-top"><span>${escapeHtml(metric.label)}</span><span class="metric-icon">${escapeHtml(metric.icon)}</span></div>
      <div class="metric-value">${metric.value === null ? "—" : numberFormat.format(metric.value)}</div>
      <div class="metric-hint">${escapeHtml(metric.hint)}</div>
    </article>
  `).join("");
}

function renderCoverage() {
  const ready = state.workSummaryReadiness.ready;
  const summary = ready ? state.workModel.summary : null;
  const capacity = getCapacityStats();
  const assignmentRate = ready ? nullableNumber(summary.assignmentCoverageRate) : null;
  const estimateRate = ready ? nullableNumber(summary.estimateEvidenceCoverageRate) : null;
  const resultRate = ready ? nullableNumber(summary.resultEvidenceCoverageRate) : null;
  const resultCoverage = ready ? summary.resultEvidenceCoverageStatus : null;
  const cards = [
    {
      label: "InfoCenter 人力標記覆蓋",
      value: assignmentRate === null ? null : Math.round(assignmentRate * 100),
      fraction: ready ? `${summary.assignmentCoverageCount} / ${summary.active} 筆未完成工作` : "InfoCenter 來源不可用",
      note: ready ? `${summary.unassigned} 筆未見人力標記；標記不等同正式主責` : "不以其他清單補值",
      tone: assignmentRate === null ? "missing" : assignmentRate >= 0.9 ? "good" : "warning",
    },
    {
      label: "工時依據覆蓋率",
      value: estimateRate === null ? null : Math.round(estimateRate * 100),
      fraction: ready ? `${summary.timeReportCount || 0} 筆評論耗時回報` : "InfoCenter 來源不可用",
      note: ready ? `未完成工作 P80 合計約 ${numberFormat.format(summary.totalEstimatedHoursP80 || 0)} 小時` : "不以規劃基準冒充實際成果",
      tone: estimateRate === null ? "missing" : estimateRate >= 0.8 ? "good" : "warning",
    },
    {
      label: "工作結果證據覆蓋",
      value: resultRate === null ? null : Math.round(resultRate * 100),
      fraction: !ready
        ? "InfoCenter 來源不可用"
        : resultCoverage ? `證據狀態：${resultCoverageLabel(resultCoverage)}` : "目前 v1 快照尚無工作結果覆蓋欄位",
      note: resultCoverage === "partial"
        ? "事件證據僅為部分觀測；缺少紀錄不代表沒有成果"
        : resultCoverage === "complete" ? "事件證據觀測範圍完整，仍不取代人工驗收" : "維持未知，不顯示假零值",
      tone: resultRate === null ? "missing" : resultCoverage === "complete" ? "good" : "warning",
    },
  ];

  document.querySelector("#coverageGrid").innerHTML = cards.map((card) => `
    <article class="coverage-card ${card.tone}">
      <div class="coverage-card-head"><span>${escapeHtml(card.label)}</span><strong>${card.value === null ? "—" : `${card.value}%`}</strong></div>
      <div class="coverage-track" aria-hidden="true"><span style="width:${card.value === null ? 0 : clamp(card.value, 0, 100)}%"></span></div>
      <p>${escapeHtml(card.fraction)}</p>
      <small>${escapeHtml(card.note)}</small>
    </article>`).join("");

  document.querySelector("#capacityAdvisory").innerHTML = `
    <div>
      <span class="section-kicker">人工人力補充・非派案紀錄</span>
      <strong>${capacity.covered}/${capacity.activeCount} 位已回填</strong>
    </div>
    <p>${capacity.covered
      ? `本週人工可用工時合計 ${numberFormat.format(capacity.availableHours)} 小時，只供人工選人時複核。`
      : "本週尚無有效容量回填；不從歷史工時、事件數或活動訊號推定可用時數。"}</p>`;
}

function resultCoverageLabel(value) {
  return value === "complete" ? "完整" : value === "partial" ? "部分觀測" : value === "none" ? "未觀測" : "未知";
}

function renderPriorityBanner() {
  const top = state.recommendations[0];
  const banner = document.querySelector("#priorityBanner");
  if (!top) {
    banner.innerHTML = `
      <div><p class="eyebrow">今天先處理</p><h2>目前沒有明顯例外</h2><p>可進入 InfoCenter 工作盤面，確認下一批工作。</p></div>
      <button class="button button-light" type="button" data-go-view="dispatch">查看工作盤面</button>`;
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
  if (!state.workSummaryReadiness.ready) {
    const unavailable = `<div class="empty-state">${escapeHtml(state.workSummaryReadiness.label)}。派案與工作結果不以雷達待辦或其他來源替代。</div>`;
    overview.innerHTML = unavailable;
    dispatch.innerHTML = unavailable;
    return;
  }
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
  if (!tasks.length) return '<div class="empty-state">這個 InfoCenter 篩選條件下沒有工作。</div>';

  return tasks.map((task) => {
    const issueType = getTaskIssueType(task);
    const issueLabel = issueType === "marker_conflict" ? "標記與狀態待確認" : issueType === "status_review" ? "待確認狀態" : "";
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
          ${task.estimatedHoursP80 !== null ? `<span>工時 P50 / P80：${escapeHtml(formatNullableHours(task.estimatedHoursP50))} / ${escapeHtml(formatNullableHours(task.estimatedHoursP80))}</span>` : ""}
        </div>
          ${task.source === "infocenter" ? `<div class="task-evidence"><span>${escapeHtml(estimateConfidenceLabel(task.estimateConfidence))}</span><span>${escapeHtml(formatNullableCount(task.estimateSampleCount))}耗時樣本</span><span>${escapeHtml(resultEvidenceLabel(task))}</span>${task.skills.length ? `<span>${escapeHtml(task.skills.join("、"))}</span>` : ""}</div>` : ""}
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

function resultEvidenceLabel(task) {
  if (["unavailable", "none"].includes(task.resultEvidenceCoverage)) return "成果證據未觀測・不推定驗收";
  const labels = {
    accepted_event: "已有事件驗收證據",
    accepted_event_visible: "曾見事件驗收通過・不等同整項工作驗收",
    in_review: "曾見送審處理紀錄・最新狀態待確認",
    needs_revision: "曾見退回紀錄・最新狀態待確認",
    activity_only: "有活動・未見驗收證據",
    activity_visible: "曾見事件活動・未推定驗收",
    outside_observed_window: "成果超出目前觀測窗",
    no_event: "目前觀測窗未見事件",
    no_linked_events: "未連結事件・不推定無成果",
    completed_work: "工作狀態已完成・驗收另核對",
    work_completed: "工作狀態已完成・驗收另核對",
    cancelled: "工作已取消・成果證據不適用",
    unknown: "成果狀態未分類",
  };
  const stateLabel = labels[task.resultState] || "成果狀態未分類";
  return task.resultEvidenceCoverage === "partial" ? `${stateLabel}・部分觀測` : stateLabel;
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
  const triage = issueType === "marker_conflict"
    ? "狀態為進行中但未見 InfoCenter 人力標記。先在平台確認正式派案，再決定補標記、更新狀態或結案。"
    : issueType === "status_review"
      ? "已見人力標記與事件，但工作仍顯示待開始。先抽查事件是否含實際執行證據，再統一狀態。"
      : task.overdue
        ? "先判斷這筆工作要續做、改期或結案；確認仍有效後才進行派工。"
        : task.assignedCount === 0
          ? "工作仍有效時，回到 InfoCenter 確認正式派案與人力標記；人工容量只供複核。"
          : "已見 InfoCenter 人力標記，但仍需另行確認正式主責、成果送審與人工驗收。";
  const matchPanel = renderTaskCapabilityMatches(task);
  document.querySelector("#taskDetailTitle").textContent = task.title;
  document.querySelector("#taskDetailBody").innerHTML = `
    <div class="task-detail-grid">
      <div><span>公開代碼</span><strong>${escapeHtml(task.id)}</strong></div>
      <div><span>目前狀態</span><strong>${escapeHtml(task.status)}</strong></div>
      <div><span>InfoCenter 人力標記</span><strong>${escapeHtml(task.owner)}</strong></div>
      <div><span>期限</span><strong>${task.due ? escapeHtml(task.due) : "未設定"}</strong></div>
      <div><span>判斷門檻</span><strong>${escapeHtml(capabilityStageLabel(task.minimumLevel))}</strong></div>
      <div><span>預估 P50 / P80</span><strong>${escapeHtml(formatNullableHours(task.estimatedHoursP50))} / ${escapeHtml(formatNullableHours(task.estimatedHoursP80))}</strong></div>
    </div>
    <div class="task-triage-note"><span>建議處理</span><p>${escapeHtml(triage)}</p></div>
    ${matchPanel}
    <div class="task-detail-evidence">
      <span>事件 ${escapeHtml(formatNullableCount(task.eventCount))}</span>
      <span>驗收通過事件 ${escapeHtml(formatNullableCount(task.completedEventCount))}</span>
      <span>${escapeHtml(resultEvidenceLabel(task))}</span>
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
    `需確認：${issueType === "marker_conflict" ? "進行中但未見 InfoCenter 人力標記" : issueType === "status_review" ? "已見人力標記與事件但仍待開始" : task.overdue ? "逾期有效性" : "無"}`,
    `工作結果證據：${resultEvidenceLabel(task)}`,
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
    .sort(compareTaskCandidates)
    .slice(0, 3);
}

function compareTaskCandidates(a, b) {
  return b.score - a.score || String(a.id || "").localeCompare(String(b.id || ""));
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
          <small>${person.capacity ? `人工容量參考：本週可用 ${numberFormat.format(person.capacity.availableHours)} 小時` : "人工容量參考：待確認"}</small>
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
  const items = getNotificationItems();
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

function buildPlatformNotifications(workSummary, tasks = []) {
  const readiness = inspectInfoCenterWorkSummary(workSummary);
  if (!readiness.ready) {
    return [{
      id: "infocenter-work-source-unavailable",
      category: "InfoCenter 來源",
      severity: "urgent",
      status: "open",
      title: "派案與工作結果目前不可用",
      summary: `${readiness.label}；核心數字維持未知，不改用每週清單或人工提醒替代。`,
      when: "重新讀取後確認",
      nextAction: "檢查正確組織、登入與唯讀摘要產生流程。",
      link: "https://www.egroup-infocenter.com/me/work?tab=list",
      linkLabel: "到 InfoCenter 查看工作",
      source: "infocenter-summary",
    }];
  }

  const model = projectInfoCenterWorkSummary(workSummary);
  const summary = model.summary;
  const items = [];
  if (summary.overdue > 0) {
    items.push({
      id: "infocenter-overdue-work",
      category: "平台例外",
      severity: "urgent",
      status: "open",
      title: `${summary.overdue} 筆逾期未完成待確認`,
      summary: "此數字直接取自同一份 InfoCenter 工作摘要；請在平台逐筆確認續做、改期或結案。",
      when: `InfoCenter 截止 ${formatDateTime(parseDate(readiness.generatedAt))}`,
      nextAction: "回到 InfoCenter 確認工作有效性與期限。",
      link: "https://www.egroup-infocenter.com/me/work?tab=list",
      linkLabel: "到 InfoCenter 查看工作",
      source: "infocenter-summary",
    });
  }
  if (summary.unassigned > 0) {
    items.push({
      id: "infocenter-marker-gap",
      category: "平台例外",
      severity: "attention",
      status: "open",
      title: `${summary.unassigned} 筆未完成工作未見 InfoCenter 人力標記`,
      summary: "人力標記只代表公開摘要觀測到的標記，不等同正式未派案或正式主責。",
      when: `InfoCenter 截止 ${formatDateTime(parseDate(readiness.generatedAt))}`,
      nextAction: "回到 InfoCenter 確認正式派案與人力標記。",
      link: "https://www.egroup-infocenter.com/me/work?tab=list",
      linkLabel: "到 InfoCenter 查看工作",
      source: "infocenter-summary",
    });
  }
  const markerConflicts = tasks.filter((task) => getTaskIssueType(task) === "marker_conflict").length;
  if (markerConflicts > 0) {
    items.push({
      id: "infocenter-marker-status-conflict",
      category: "平台例外",
      severity: "attention",
      status: "open",
      title: `${markerConflicts} 筆進行中工作未見 InfoCenter 人力標記`,
      summary: "請以平台上的正式派案與工作狀態為準，公開摘要不自行推定主責。",
      when: `InfoCenter 截止 ${formatDateTime(parseDate(readiness.generatedAt))}`,
      nextAction: "在 InfoCenter 確認正式派案後再調整標記或狀態。",
      link: "https://www.egroup-infocenter.com/me/work?tab=list",
      linkLabel: "到 InfoCenter 查看工作",
      source: "infocenter-summary",
    });
  }
  return items;
}

function getNotificationItems() {
  const platformItems = buildPlatformNotifications(state.datasets.workSummary, state.tasks);
  const staticItems = Array.isArray(state.datasets.notifications?.items)
    ? state.datasets.notifications.items.filter((item) => item.id !== "overdue-work-review" && item.category !== "逾期工作")
    : [];
  return [...platformItems, ...staticItems];
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
  document.querySelector("#navDispatchCount").textContent = state.workSummaryReadiness.ready
    ? String(state.workModel.summary.unassigned)
    : "—";
  document.querySelector("#navRecommendationCount").textContent = String(state.recommendations.length);
  const notifications = getNotificationItems();
  document.querySelector("#navNotificationCount").textContent = String(notifications.filter((item) => item.status !== "resolved").length);
}

function updateFooter() {
  const otherLatest = state.sources
    .filter((source) => source.name !== "InfoCenter 派案與工作結果")
    .map((source) => source.date)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  const cutoff = state.workSummaryReadiness.ready
    ? `${state.workSummaryReadiness.organizationMarker}・${formatDateTime(parseDate(state.workSummaryReadiness.generatedAt))}（最近一次已驗證快照）`
    : `不可用（${state.workSummaryReadiness.label}）`;
  document.querySelector("#footerTimestamp").textContent = `InfoCenter 截止：${cutoff}｜其他來源最新：${otherLatest ? formatDate(otherLatest) : "無"}｜頁面讀取：${formatDateTime(new Date())}`;
}

async function copyManagementBrief() {
  const interns = state.datasets.interns?.meta?.counts || {};
  if (!state.workSummaryReadiness.ready) {
    const unavailableBrief = [
      "# 工讀生總工作藍圖摘要",
      `- InfoCenter 派案與工作結果：—（${state.workSummaryReadiness.label}）`,
      "- 核心工作數字：—",
      "- 平台例外：—",
      "",
      "注意：不以每週雷達、人工提醒或容量檔替代 InfoCenter 派案與工作結果。",
    ].join("\n");
    await copyText(unavailableBrief, "管理摘要已複製");
    return;
  }
  const summary = state.workModel.summary;
  const capacity = getCapacityStats();
  const markerConflicts = state.tasks.filter((task) => getTaskIssueType(task) === "marker_conflict").length;
  const statusReviews = state.tasks.filter((task) => getTaskIssueType(task) === "status_review").length;
  const brief = [
    "# 工讀生總工作藍圖摘要",
    `- InfoCenter 截止：${state.workSummaryReadiness.organizationMarker}・${formatDateTime(parseDate(state.workSummaryReadiness.generatedAt))}（最近一次已驗證快照，不是瀏覽器即時狀態）`,
    `- InfoCenter 掃描：${summary.scannedWorks} 筆工作`,
    `- 未完成：${summary.active} 筆（未見人力標記 ${summary.unassigned}、進行中 ${summary.inProgress}）`,
    `- 已完成工作狀態：${summary.completed} 筆（不推定事件驗收結果）`,
    `- 逾期未完成：${summary.overdue} 筆`,
    `- 狀態需確認：進行中但未見人力標記 ${markerConflicts} 筆；已見標記與事件但仍待開始 ${statusReviews} 筆`,
    `- InfoCenter 人力標記覆蓋率：${Math.round(toNumber(summary.assignmentCoverageRate) * 100)}%（不等同正式主責）`,
    `- 工時依據：${summary.timeReportCount || 0} 筆評論回報，未完成工作 P80 約 ${numberFormat.format(summary.totalEstimatedHoursP80 || 0)} 小時`,
    `- Active 成員：${interns.active || 0} 位`,
    `- 人工容量補充（非派案紀錄）：${capacity.covered}/${capacity.activeCount} 位已回填，合計 ${numberFormat.format(capacity.availableHours)} 小時`,
    `- 建議事項：${state.recommendations.length} 筆`,
    "",
    "## 優先建議",
    ...state.recommendations.slice(0, 5).map((item) => `- ${item.title}：${item.action}`),
    "",
    "注意：候選排序不使用人工容量作為平手判斷；正式派工、驗收與派薪請回到 InfoCenter。",
  ].join("\n");
  await copyText(brief, "管理摘要已複製");
}

async function copyRecommendationList() {
  const text = state.recommendations.map((item, index) => `${index + 1}. ${item.title}\n   下一步：${item.action}\n   原因：${item.reason}`).join("\n\n");
  await copyText(text || "目前沒有建議事項。", "建議清單已複製");
}

async function copyNotificationList() {
  const items = getNotificationItems();
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    inspectInfoCenterWorkSummary,
    projectInfoCenterWorkSummary,
    normalizeInfoCenterWorkItems,
    buildPlatformNotifications,
    compareTaskCandidates,
    resultEvidenceLabel,
  };
}
