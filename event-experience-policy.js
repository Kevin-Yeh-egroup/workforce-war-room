(function attachEventExperiencePolicy(globalScope) {
  "use strict";

  const PERSON_ID_PATTERN = /^[a-f0-9]{12}$/;
  const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
  const SOURCE_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
  const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  const ROOT_KEYS = ["meta", "entries"];
  const META_KEYS = [
    "version", "status", "generatedAt", "sourceFetchedAt", "source", "organizationLabel",
    "snapshotFingerprint", "rosterFingerprint", "overrideFingerprint", "rosterSourceModifiedAt",
    "rosterSourceFingerprint", "activeRosterCount", "coverageStatus", "coverage", "privacy",
    "decisionBoundary", "qualification", "currentLimitation",
  ];
  const COVERAGE_KEYS = [
    "status", "totalAvailable", "scannedEvents", "scannedEventDetails", "detailErrors",
    "duplicateEventIds", "eventIdMismatches", "qualifyingEvents", "excludedEvents",
    "unmatchedPeople", "conflictingMinutes", "exclusionCounts",
  ];
  const ENTRY_KEYS = [
    "personId", "verifiedMinutes", "xp", "qualifyingEventCount", "reviewStatus", "eventClosed",
    "firstQualifiedAt", "lastQualifiedAt",
  ];

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasExactKeys(value, allowedKeys) {
    if (!isPlainObject(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...allowedKeys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isIsoDateTime(value) {
    return typeof value === "string"
      && ISO_DATE_TIME_PATTERN.test(value)
      && Number.isFinite(Date.parse(value));
  }

  function isDateOnly(value) {
    if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function asNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  }

  function result(ready, reason, coverage, entries = []) {
    const total = asNonNegativeInteger(coverage && coverage.totalAvailable) || 0;
    const scanned = asNonNegativeInteger(coverage && coverage.scannedEventDetails) || 0;
    return {
      ready,
      reason,
      coverage,
      entries,
      map: ready ? new Map(entries.map((entry) => [String(entry.personId), entry])) : new Map(),
      sourceLabel: ready
        ? `${total.toLocaleString("en-US")}/${scanned.toLocaleString("en-US")}、0 errors、verified`
        : pendingLabel(reason),
    };
  }

  function pendingLabel(reason) {
    const labels = {
      missing_dataset: "待事件核對・資料未讀取",
      active_roster_missing: "待事件核對・名冊未就緒",
      unverified_status: "待事件核對・未驗證",
      provenance_missing: "待事件核對・來源證據不足",
      roster_version_mismatch: "待事件核對・名冊版本不符",
      incomplete_coverage: "待事件核對・尚未全量",
      coverage_mismatch: "待事件核對・涵蓋數不符",
      detail_errors: "待事件核對・明細錯誤",
      duplicate_event_ids: "待事件核對・事件重複",
      event_id_mismatch: "待事件核對・事件對應不符",
      schema_mismatch: "待事件核對・資料契約不符",
      invalid_entries: "待事件核對・格式錯誤",
      duplicate_person_id: "待事件核對・人員重複",
      inactive_person_id: "待事件核對・名冊不符",
      aggregate_mismatch: "待事件核對・加總不符",
    };
    return labels[reason] || "待事件核對";
  }

  function inspect(dataset, activePersonIds, rosterMeta = {}) {
    if (!hasExactKeys(dataset, ROOT_KEYS)) return result(false, "missing_dataset", null);
    const meta = dataset.meta;
    const coverage = meta && meta.coverage;
    const entries = Array.isArray(dataset.entries) ? dataset.entries : null;
    const activeIds = new Set(Array.from(activePersonIds || [], (id) => String(id)));

    if (!activeIds.size) return result(false, "active_roster_missing", coverage, entries || []);
    if (!hasExactKeys(meta, META_KEYS)) return result(false, "schema_mismatch", coverage, entries || []);
    if (meta.version !== "0.3.0" || meta.status !== "verified") {
      return result(false, "unverified_status", coverage, entries || []);
    }
    if (meta.source !== "InfoCenter 事件管理"
      || !isNonEmptyString(meta.organizationLabel)
      || !isIsoDateTime(meta.generatedAt)
      || !isIsoDateTime(meta.sourceFetchedAt)
      || !(meta.rosterSourceModifiedAt === null || isIsoDateTime(meta.rosterSourceModifiedAt))
      || ![meta.snapshotFingerprint, meta.rosterFingerprint, meta.overrideFingerprint]
        .every((value) => typeof value === "string" && FINGERPRINT_PATTERN.test(value))
      || !isNonEmptyString(meta.privacy)
      || !isNonEmptyString(meta.decisionBoundary)
      || !Array.isArray(meta.qualification)
      || meta.qualification.length === 0
      || !meta.qualification.every(isNonEmptyString)
      || !isNonEmptyString(meta.currentLimitation)) {
      return result(false, "provenance_missing", coverage, entries || []);
    }
    if (!Number.isInteger(meta.activeRosterCount)
      || meta.activeRosterCount < 1
      || meta.activeRosterCount !== activeIds.size
      || typeof meta.rosterSourceFingerprint !== "string"
      || !SOURCE_FINGERPRINT_PATTERN.test(meta.rosterSourceFingerprint)
      || typeof rosterMeta.sourceFingerprint !== "string"
      || !SOURCE_FINGERPRINT_PATTERN.test(rosterMeta.sourceFingerprint)
      || meta.rosterSourceFingerprint !== rosterMeta.sourceFingerprint) {
      return result(false, "roster_version_mismatch", coverage, entries || []);
    }
    if (meta.coverageStatus !== "complete" || !hasExactKeys(coverage, COVERAGE_KEYS) || coverage.status !== "complete") {
      return result(false, "incomplete_coverage", coverage, entries || []);
    }

    const total = asNonNegativeInteger(coverage.totalAvailable);
    const scannedEvents = asNonNegativeInteger(coverage.scannedEvents);
    const scannedDetails = asNonNegativeInteger(coverage.scannedEventDetails);
    const detailErrors = asNonNegativeInteger(coverage.detailErrors);
    const qualifyingEvents = asNonNegativeInteger(coverage.qualifyingEvents);
    const excludedEvents = asNonNegativeInteger(coverage.excludedEvents);
    const duplicateEventIds = asNonNegativeInteger(coverage.duplicateEventIds);
    const eventIdMismatches = asNonNegativeInteger(coverage.eventIdMismatches);
    const unmatchedPeople = asNonNegativeInteger(coverage.unmatchedPeople);
    const conflictingMinutes = asNonNegativeInteger(coverage.conflictingMinutes);
    const exclusionCounts = coverage.exclusionCounts;
    if (!total || scannedEvents !== total || scannedDetails !== total
      || qualifyingEvents === null || excludedEvents === null
      || unmatchedPeople === null || conflictingMinutes === null
      || qualifyingEvents + excludedEvents !== total
      || !isPlainObject(exclusionCounts)
      || !Object.values(exclusionCounts).every((value) => Number.isInteger(value) && value >= 1)
      || Object.values(exclusionCounts).reduce((sum, value) => sum + value, 0) !== excludedEvents
      || (exclusionCounts.unmatched_person || 0) !== unmatchedPeople
      || (exclusionCounts.conflicting_minutes || 0) !== conflictingMinutes) {
      return result(false, "coverage_mismatch", coverage, entries || []);
    }
    if (detailErrors !== 0) return result(false, "detail_errors", coverage, entries || []);
    if (duplicateEventIds !== 0) return result(false, "duplicate_event_ids", coverage, entries || []);
    if (eventIdMismatches !== 0) return result(false, "event_id_mismatch", coverage, entries || []);
    if (!entries) return result(false, "invalid_entries", coverage, []);

    const seen = new Set();
    let summedEvents = 0;
    for (const entry of entries) {
      if (!hasExactKeys(entry, ENTRY_KEYS)) return result(false, "invalid_entries", coverage, entries);
      const personId = entry.personId;
      const minutes = entry.verifiedMinutes;
      const xp = entry.xp;
      const eventCount = asNonNegativeInteger(entry && entry.qualifyingEventCount);
      if (typeof personId !== "string" || !PERSON_ID_PATTERN.test(personId)
        || typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0
        || !Number.isInteger(xp) || xp !== Math.round(minutes / 6)
        || !eventCount
        || entry.reviewStatus !== "SUCCESS"
        || entry.eventClosed !== true
        || !isDateOnly(entry.firstQualifiedAt)
        || !isDateOnly(entry.lastQualifiedAt)
        || entry.firstQualifiedAt > entry.lastQualifiedAt) {
        return result(false, "invalid_entries", coverage, entries);
      }
      if (seen.has(personId)) return result(false, "duplicate_person_id", coverage, entries);
      if (!activeIds.has(personId)) return result(false, "inactive_person_id", coverage, entries);
      seen.add(personId);
      summedEvents += eventCount;
    }
    if (summedEvents !== qualifyingEvents) return result(false, "aggregate_mismatch", coverage, entries);
    return result(true, "verified_complete", coverage, entries);
  }

  const api = { inspect, pendingLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.EventExperiencePolicy = api;
})(typeof window !== "undefined" ? window : globalThis);
