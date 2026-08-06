const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = __dirname;
const read = (name) => JSON.parse(readFileSync(join(root, name), "utf8").replace(/^\uFEFF/, ""));
const fields = read("fields.json");
const templates = read("templates.json");
const calculations = read("dashboard-calculations.json");
const verification = read("execution-verification.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const [name, data] of Object.entries({ fields, templates, calculations, verification })) {
  assert(data.meta?.status === "local-draft", `${name}: status must be local-draft`);
  assert(data.meta?.externalWriteApproved === false, `${name}: externalWriteApproved must be false`);
}

const unique = (values) => new Set(values).size === values.length;
const fieldIds = fields.fields.map((field) => field.id);
assert(unique(fieldIds), "fields: duplicate field id");
assert(templates.templatePairs.length === 3, "templates: exactly three template pairs are required");
assert(unique(templates.templatePairs.map((pair) => pair.id)), "templates: duplicate template id");
assert(unique(calculations.metrics.map((metric) => metric.id)), "calculations: duplicate metric id");
assert(unique(verification.states.map((state) => state.id)), "verification: duplicate state id");

const fieldIdSet = new Set(fieldIds);
for (const pair of templates.templatePairs) {
  assert(pair.workTemplate && pair.eventTemplate, `${pair.id}: work/event pair missing`);
  for (const fieldId of Object.keys(pair.workTemplate.fieldValues || {})) {
    assert(fieldIdSet.has(fieldId), `${pair.id}: unknown work field ${fieldId}`);
  }
  for (const fieldId of [...(pair.eventTemplate.requiredFields || []), ...(pair.eventTemplate.conditionalFields || [])]) {
    assert(fieldIdSet.has(fieldId), `${pair.id}: unknown event field ${fieldId}`);
  }
  assert(pair.estimatePolicy.p80Hours >= pair.estimatePolicy.p50Hours, `${pair.id}: P80 must be >= P50`);
}

const requiredMetrics = ["assignment_coverage_rate", "estimate_evidence_coverage_rate", "capacity_coverage_rate", "execution_evidence_coverage_rate", "verified_completion_rate"];
for (const metricId of requiredMetrics) {
  assert(calculations.metrics.some((metric) => metric.id === metricId), `calculations: missing ${metricId}`);
}

assert(verification.aiReview.outputSchema.humanApprovalRequired === true, "AI review must require human approval");
assert(verification.aiReview.mustNotDo.some((item) => item.includes("自動建立薪資")), "AI payroll prohibition missing");

console.log(JSON.stringify({
  result: "PASS",
  fields: fields.fields.length,
  templatePairs: templates.templatePairs.length,
  metrics: calculations.metrics.length,
  executionStates: verification.states.length,
  externalWriteApproved: false,
}, null, 2));
