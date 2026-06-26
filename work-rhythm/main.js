const state = {
  data: null,
  query: "",
  confidence: "",
  time: "",
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function text(value, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function confidenceLabel(value) {
  if (value === "high") return "高信心";
  if (value === "medium") return "中信心";
  if (value === "low") return "低信心";
  return value || "未標示";
}

function metric(label, value, note = "") {
  return `
    <article class="metric">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      ${note ? `<div class="footer-note">${note}</div>` : ""}
    </article>
  `;
}

function renderMetrics(data) {
  const summary = data.summary || {};
  document.querySelector("#metrics").innerHTML = [
    metric("觀察人數", text(summary.peopleCount, "0")),
    metric("工作訊號", text(summary.totalSignals, "0")),
    metric("掃描事件", text(summary.scannedEvents, "0")),
    metric("高信心訊號", text(summary.highConfidenceSignals, "0")),
    metric("晚間/清晨", text(summary.eveningSignals, "0"), "18:00 後或 08:00 前"),
  ].join("");
}

function renderLegend(data) {
  const guide = (data.meta && data.meta.confidenceGuide) || {};
  document.querySelector("#legend").innerHTML = `
    <div><span class="pill high">高信心</span> ${text(guide.high, "評論或明確審核時間。")}</div>
    <div><span class="pill medium">中信心</span> ${text(guide.medium, "事件建立、更新或狀態推估。")}</div>
    <div><span class="pill low">低信心</span> ${text(guide.low, "暫不做正式判讀。")}</div>
  `;
}

function renderSource(data) {
  const meta = data.meta || {};
  const source = meta.source || {};
  document.querySelector("#source").innerHTML = `
    <div>來源：${text(source.system)} / ${text(source.mode)}</div>
    <div>組織：${text(source.organizationLabel || source.organizationId)}</div>
    <div>產生時間：${formatDateTime(meta.generatedAt)}</div>
    <div>涵蓋：${formatDateTime(meta.coverage && meta.coverage.firstSignalAt)} ～ ${formatDateTime(meta.coverage && meta.coverage.latestSignalAt)}</div>
    <div class="footer-note">${text(meta.privacy, "")}</div>
  `;
}

function topCountLabel(items, fallback = "尚無") {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 3).map((item) => `${item.key} ${item.count}`).join("、");
}

function bars(items, labeler = (item) => item.key) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="footer-note">尚無可視覺化資料</div>`;
  }
  const max = Math.max(...items.map((item) => item.count || 0), 1);
  return `
    <div class="bars">
      ${items.slice(0, 8).map((item) => `
        <div class="bar">
          <span>${labeler(item)}</span>
          <div class="track"><div class="fill" style="width:${Math.max(6, (item.count / max) * 100)}%"></div></div>
          <span>${item.count}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function personMatches(person) {
  const query = state.query.trim().toLowerCase();
  if (query) {
    const haystack = [
      person.name,
      ...(person.categories || []).map((item) => item.key),
      ...(person.signalTypes || []).map((item) => item.key),
    ].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (state.confidence) {
    const hasConfidence = (person.confidenceBreakdown || []).some((item) => item.key === state.confidence);
    if (!hasConfidence) return false;
  }
  if (state.time === "evening" && Number(person.eveningShare || 0) < 0.4) return false;
  if (state.time === "weekend" && Number(person.weekendShare || 0) < 0.25) return false;
  return true;
}

function renderPerson(person) {
  const topConfidence = (person.confidenceBreakdown || [])[0];
  const confidenceClass = topConfidence ? topConfidence.key : "medium";
  return `
    <article class="person">
      <div class="person-header">
        <div>
          <h3>${person.name}</h3>
          <div class="meta">
            <span>最近：${formatDateTime(person.latestSignalAt)}</span>
            <span>活躍日：${text(person.activeDayCount, "0")}</span>
            <span>事件：${text(person.eventCount, "0")}</span>
          </div>
        </div>
        <div>
          <span class="pill ${confidenceClass}">${confidenceLabel(confidenceClass)}</span>
          <span class="pill blue">${text(person.signalCount, "0")} 訊號</span>
        </div>
      </div>

      <div class="meta" style="margin-bottom:12px">
        <span>常見工作：${topCountLabel(person.categories)}</span>
        <span>訊號類型：${topCountLabel(person.signalTypes)}</span>
        <span>晚間/清晨：${percent(person.eveningShare)}</span>
        <span>假日：${percent(person.weekendShare)}</span>
      </div>

      <div class="grid-2">
        <section>
          <h4>常見時段</h4>
          ${bars(person.hourBuckets, (item) => `${item.key}時`)}
        </section>
        <section>
          <h4>星期分布</h4>
          ${bars(person.weekdayBuckets, (item) => `週${weekdayLabels[Number(item.key)] || item.key}`)}
        </section>
      </div>
    </article>
  `;
}

function renderPeople(data) {
  const people = (data.people || []).filter(personMatches);
  const target = document.querySelector("#people");
  if (!people.length) {
    target.innerHTML = `
      <div class="notice">
        <h2>尚未有可呈現的工作節奏資料</h2>
        <p>如果這是第一次使用，請先執行 automation-3 的工作節奏讀取腳本。若已執行，可能是 InfoCenter 列表沒有抓到可歸屬到工讀生的事件。</p>
      </div>
    `;
    return;
  }
  target.innerHTML = people.map(renderPerson).join("");
}

function renderRecent(data) {
  const recent = data.recentSignals || [];
  const target = document.querySelector("#recent");
  if (!recent.length) {
    target.innerHTML = `<div class="footer-note">尚無最近訊號。</div>`;
    return;
  }
  target.innerHTML = recent.slice(0, 12).map((item) => `
    <div class="recent-item">
      <div class="meta">
        <strong>${item.person}</strong>
        <span>${formatDateTime(item.at)}</span>
        <span class="pill ${item.confidence}">${confidenceLabel(item.confidence)}</span>
        <span>${item.signalType}</span>
      </div>
      <div class="footer-note">${text(item.category)}｜${text(item.status)}｜${text(item.reviewStatus)}</div>
    </div>
  `).join("");
}

function renderGaps(data) {
  const gaps = data.gaps || [];
  document.querySelector("#gaps").innerHTML = gaps.map((gap) => `<li>${gap}</li>`).join("");
}

function render() {
  const data = state.data;
  if (!data) return;
  renderMetrics(data);
  renderLegend(data);
  renderSource(data);
  renderPeople(data);
  renderRecent(data);
  renderGaps(data);
}

async function load() {
  try {
    const response = await fetch("/data/work-rhythm.internal.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (error) {
    state.data = {
      meta: {
        generatedAt: new Date().toISOString(),
        privacy: "讀取資料失敗。",
        confidenceGuide: {},
      },
      summary: {},
      people: [],
      recentSignals: [],
      gaps: [`讀取 /data/work-rhythm.internal.json 失敗：${error.message}`],
    };
  }
  render();
}

document.querySelector("#query").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

document.querySelector("#confidence").addEventListener("change", (event) => {
  state.confidence = event.target.value;
  render();
});

document.querySelector("#time").addEventListener("change", (event) => {
  state.time = event.target.value;
  render();
});

load();
