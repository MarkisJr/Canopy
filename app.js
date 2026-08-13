(function () {
  "use strict";

  const APP_VERSION = "0.9.6";
  const SCHEMA_VERSION = 5;
  const STORAGE_KEY = "canopy-budget-data-v1";
  const UNCATEGORISED_CATEGORY_ID = "cat_uncategorised";
  const EXTERNAL_BACKUP_INTERVAL_MS = 48 * 60 * 60 * 1000;
  const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const UPDATE_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const UPDATE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const UPDATE_MANIFEST_URL =
    "https://api.github.com/repos/MarkisJr/Canopy/contents/version.json?ref=main";
  const UPDATE_APP_SOURCE_URL =
    "https://api.github.com/repos/MarkisJr/Canopy/contents/app.js?ref=main";
  const UPDATE_RAW_MANIFEST_URL =
    "https://raw.githubusercontent.com/MarkisJr/Canopy/main/version.json";
  const UPDATE_RAW_APP_SOURCE_URL =
    "https://raw.githubusercontent.com/MarkisJr/Canopy/main/app.js";
  const CALENDAR_INITIAL_WEEKS = 32;
  const CALENDAR_CURRENT_WEEK_INDEX = 12;
  const CALENDAR_BATCH_WEEKS = 8;
  const CALENDAR_MAX_WEEKS = 40;
  const THEME_ORDER = ["power", "fern", "blush"];
  const COLOURS = [
    "#8eadcf",
    "#75c7a0",
    "#e3b76b",
    "#d990b7",
    "#a993d6",
    "#e58383",
    "#7cb7b9",
    "#cf9a6b",
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const uid = (prefix = "id") =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function localDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    if (!value) return new Date();
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDays(value, days) {
    const date = parseDate(value);
    date.setDate(date.getDate() + Number(days));
    return localDate(date);
  }

  function addMonths(value, months) {
    const date = parseDate(value);
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + Number(months));
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    return localDate(date);
  }

  function addYears(value, years) {
    const date = parseDate(value);
    const month = date.getMonth();
    date.setFullYear(date.getFullYear() + Number(years));
    if (date.getMonth() !== month) date.setDate(0);
    return localDate(date);
  }

  function daysBetween(start, end) {
    return Math.round((parseDate(end) - parseDate(start)) / 86400000);
  }

  function startOfCalendarWeek(value) {
    const date = parseDate(value);
    const mondayOffset = (date.getDay() + 6) % 7;
    return addDays(localDate(date), -mondayOffset);
  }

  function formatDate(value, options = {}) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: options.month ?? "short",
      year: options.year ?? "numeric",
    }).format(parseDate(value));
  }

  function formatCompactDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(parseDate(value));
  }

  function formatDuration(totalDays) {
    const days = Math.max(0, Math.ceil(totalDays));
    if (days < 45) return `${days} day${days === 1 ? "" : "s"}`;
    if (days < 730) {
      const months = Math.ceil(days / 30.4375);
      return `${months} month${months === 1 ? "" : "s"}`;
    }
    const years = (days / 365.25).toFixed(1).replace(".0", "");
    return `${years} years`;
  }

  function normaliseVersion(value) {
    const match = String(value || "")
      .trim()
      .match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
    return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : "";
  }

  function compareVersions(left, right) {
    const leftParts = normaliseVersion(left).split(".").map(Number);
    const rightParts = normaliseVersion(right).split(".").map(Number);
    if (leftParts.length !== 3 || rightParts.length !== 3) return 0;
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] > rightParts[index]) return 1;
      if (leftParts[index] < rightParts[index]) return -1;
    }
    return 0;
  }

  function updatePlatform(userAgent = "", platform = "") {
    const signature = `${platform} ${userAgent}`;
    if (/Windows/i.test(signature)) return "windows";
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(signature) && /Macintosh|Mac OS|MacIntel/i.test(signature)) {
      return "macos";
    }
    if (!/Android/i.test(signature) && /Linux|X11/i.test(signature)) return "linux";
    return "other";
  }

  function updateScriptForPlatform(platform) {
    if (platform === "windows") {
      return {
        label: "Windows",
        filename: "update-canopy-windows.cmd",
        action: "Double-click the updater file.",
      };
    }
    if (platform === "macos") {
      return {
        label: "macOS",
        filename: "update-canopy-macos.command",
        action: "Double-click the updater file. If macOS blocks it, run chmod +x on the file once.",
      };
    }
    if (platform === "linux") {
      return {
        label: "Linux",
        filename: "update-canopy-linux.sh",
        action: "Open a terminal in the Canopy folder and run ./update-canopy-linux.sh.",
      };
    }
    return {
      label: "your computer",
      filename: "the updater for Windows, macOS, or Linux",
      action: "Choose the updater matching the desktop computer where Canopy is installed.",
    };
  }

  function initialState() {
    const start = localDate();
    const createdAt = new Date().toISOString();
    const categories = [
      ["cat_housing", "Housing", "expense", "#a993d6"],
      ["cat_bills", "Bills & subscriptions", "expense", "#8eadcf"],
      ["cat_groceries", "Groceries", "expense", "#75c7a0"],
      ["cat_transport", "Transport", "expense", "#e3b76b"],
      ["cat_health", "Health", "expense", "#d990b7"],
      ["cat_eating", "Eating out", "expense", "#cf9a6b"],
      ["cat_fun", "Fun & hobbies", "expense", "#7cb7b9"],
      ["cat_income", "Pay", "income", "#75c7a0"],
      ["cat_other_income", "Other income", "income", "#8eadcf"],
      [UNCATEGORISED_CATEGORY_ID, "Uncategorised", "both", "#6f7b88"],
    ].map(([id, name, type, color]) => ({ id, name, type, color }));

    const accounts = [
      { id: "acct_everyday", name: "Everyday", kind: "transaction", color: "#8eadcf" },
      { id: "acct_bills", name: "Bills", kind: "transaction", color: "#a993d6" },
      { id: "acct_savings", name: "Savings", kind: "savings", color: "#75c7a0" },
    ];

    const activePeriod = {
      id: uid("period"),
      startDate: start,
      endDate: addDays(start, 13),
      status: "active",
      openingBalances: Object.fromEntries(accounts.map((account) => [account.id, 0])),
      createdAt,
    };

    return {
      schemaVersion: SCHEMA_VERSION,
      metadata: {
        appVersion: APP_VERSION,
        createdAt,
        lastOpenedDate: start,
        lastSavedAt: null,
        lastExternalBackupAt: null,
        backupWindowStartedAt: createdAt,
        lastUpdateCheckAt: null,
        lastUpdateCheckAttemptAt: null,
        latestKnownVersion: null,
        updateRemindAfter: null,
        updateRemindVersion: null,
        activePeriodId: activePeriod.id,
      },
      settings: {
        currency: "AUD",
        payIntervalValue: 2,
        payIntervalUnit: "weeks",
        primaryIncomeId: "",
        theme: "power",
        sidebarCollapsed: false,
        expenseBufferAccountId: "acct_bills",
        checkForUpdates: true,
      },
      accounts,
      categories,
      incomeSources: [],
      expenses: [],
      transactions: [],
      adjustments: [],
      goals: [],
      periods: [activePeriod],
    };
  }

  function normalizeState(candidate) {
    const fresh = initialState();
    const next = candidate && typeof candidate === "object" ? candidate : fresh;
    const sourceSchemaVersion = Math.max(1, Number(next.schemaVersion) || 1);
    const candidateMetadata =
      next.metadata && typeof next.metadata === "object" ? next.metadata : {};
    next.schemaVersion = SCHEMA_VERSION;
    next.metadata = {
      ...fresh.metadata,
      ...candidateMetadata,
      appVersion: APP_VERSION,
      lastExternalBackupAt: candidateMetadata.lastExternalBackupAt || null,
      backupWindowStartedAt:
        candidateMetadata.backupWindowStartedAt ||
        candidateMetadata.createdAt ||
        candidateMetadata.lastSavedAt ||
        fresh.metadata.backupWindowStartedAt,
    };
    next.settings = { ...fresh.settings, ...(next.settings || {}) };
    for (const key of [
      "accounts",
      "categories",
      "incomeSources",
      "expenses",
      "transactions",
      "adjustments",
      "goals",
      "periods",
    ]) {
      if (!Array.isArray(next[key])) next[key] = fresh[key];
    }
    if (
      !next.accounts.some((account) => account.id === next.settings.expenseBufferAccountId)
    ) {
      const plannedAccountId = next.expenses.find((expense) =>
        next.accounts.some((account) => account.id === expense.accountId),
      )?.accountId;
      next.settings.expenseBufferAccountId = plannedAccountId || next.accounts[0]?.id || "";
    }
    const fallbackCategory = next.categories.find(
      (category) => category.id === UNCATEGORISED_CATEGORY_ID,
    );
    if (fallbackCategory) {
      fallbackCategory.name = "Uncategorised";
      fallbackCategory.type = "both";
    } else {
      next.categories.push(
        clone(
          fresh.categories.find((category) => category.id === UNCATEGORISED_CATEGORY_ID),
        ),
      );
    }
    delete next.backups;
    next.expenses.forEach((expense) => {
      expense.isEstimate = expense.isEstimate === true;
    });
    next.transactions.forEach((transaction) => {
      if (typeof transaction.goalId !== "string") transaction.goalId = "";
      if (typeof transaction.toAccountId !== "string") transaction.toAccountId = "";
      transaction.goalImpacts = normaliseGoalImpacts(transaction.goalImpacts);
    });
    next.goals.forEach((goal) => {
      goal.currentAmount = roundMoney(Number(goal.currentAmount) || 0);
      goal.startingAmount = roundMoney(Number(goal.startingAmount ?? goal.currentAmount) || 0);
    });
    if (sourceSchemaVersion < 4) {
      const goalAmounts = new Map(
        next.goals.map((goal) => [goal.id, Math.max(0, Number(goal.currentAmount) || 0)]),
      );
      next.transactions
        .slice()
        .sort(
          (a, b) =>
            String(a.date || "").localeCompare(String(b.date || "")) ||
            String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
        )
        .forEach((transaction) => {
          if (transaction.goalId || transaction.goalImpacts.length) return;
          transaction.goalImpacts = automaticGoalImpactsForState(
            transaction,
            next.goals,
            next.accounts,
            goalAmounts,
          );
          transaction.goalImpacts.forEach((impact) => {
            const amount = Math.max(
              0,
              roundMoney((goalAmounts.get(impact.goalId) || 0) + impact.amount),
            );
            goalAmounts.set(impact.goalId, amount);
            const goal = next.goals.find((item) => item.id === impact.goalId);
            if (goal) goal.currentAmount = amount;
          });
        });
    }
    if (!next.periods.some((period) => period.id === next.metadata.activePeriodId)) {
      const period = fresh.periods[0];
      period.openingBalances = Object.fromEntries(next.accounts.map((account) => [account.id, 0]));
      next.periods.push(period);
      next.metadata.activePeriodId = period.id;
    }
    return next;
  }

  function loadState() {
    if (typeof localStorage === "undefined") return initialState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : initialState();
    } catch (error) {
      console.warn("Could not read local data.", error);
      return initialState();
    }
  }

  let state = loadState();
  let currentView = "dashboard";
  let currentPlanTab = "expenses";
  let selectedGoalId = state.goals[0]?.id || null;
  let backupGateActive = false;
  let backupDemoActive = false;
  let backupCheckTimer = null;
  let updateCheckInFlight = false;
  let updateCheckResult = "";
  let calendarWeekStarts = [];
  let calendarReady = false;
  let calendarScrollFrame = null;
  let calendarProgressCache = new Map();
  let calendarTransactionsByDate = new Map();

  function activePeriod() {
    return (
      state.periods.find((period) => period.id === state.metadata.activePeriodId) ||
      state.periods.find((period) => period.status === "active") ||
      state.periods[0]
    );
  }

  function periodById(id) {
    return state.periods.find((period) => period.id === id);
  }

  function calendarPeriodForDate(date) {
    const stored = state.periods.find(
      (period) => date >= period.startDate && date <= period.endDate,
    );
    if (stored) return stored;

    const anchor = activePeriod();
    const cycleDays = Math.max(1, daysBetween(anchor.startDate, anchor.endDate) + 1);
    const cycleIndex = Math.floor(daysBetween(anchor.startDate, date) / cycleDays);
    const startDate = addDays(anchor.startDate, cycleIndex * cycleDays);
    return {
      id: `calendar_cycle_${startDate}`,
      startDate,
      endDate: addDays(startDate, cycleDays - 1),
      status: date > anchor.endDate ? "future" : "historical-gap",
      openingBalances: {},
      virtual: true,
    };
  }

  function payIntervalDays() {
    const value = Math.max(1, Number(state.settings.payIntervalValue) || 1);
    return state.settings.payIntervalUnit === "weeks" ? value * 7 : value;
  }

  function lastExternalBackupTime() {
    return Date.parse(state.metadata.lastExternalBackupAt || "");
  }

  function backupDueAt() {
    const lastBackup = lastExternalBackupTime();
    const windowStarted = Date.parse(state.metadata.backupWindowStartedAt || "");
    const anchor = Number.isFinite(lastBackup) ? lastBackup : windowStarted;
    return Number.isFinite(anchor) ? anchor + EXTERNAL_BACKUP_INTERVAL_MS : 0;
  }

  function backupIsOverdue(now = Date.now()) {
    const dueAt = backupDueAt();
    return !dueAt || Number(now) >= dueAt;
  }

  function backupFilename(date = localDate(), period = activePeriod()) {
    const start = period?.startDate || "unknown-start";
    const end = period?.endDate || "unknown-end";
    return `canopy-backup_${date}_pay-period_${start}_to_${end}.json`;
  }

  function isBackupDemoShortcut(event) {
    return (
      (event.ctrlKey || event.metaKey) &&
      event.altKey &&
      event.shiftKey &&
      String(event.key).toLowerCase() === "b"
    );
  }

  function validatedUpdateManifest(payload) {
    let manifest = payload;
    if (typeof manifest === "string") {
      try {
        manifest = JSON.parse(manifest);
      } catch {
        manifest = null;
      }
    }
    const version = normaliseVersion(manifest?.version);
    return version ? { version } : null;
  }

  function decodeGitHubFilePayload(body) {
    let payload = body;
    if (typeof body === "string") {
      try {
        payload = JSON.parse(body);
      } catch {
        return body;
      }
    }
    if (payload?.content && typeof atob === "function") {
      try {
        return atob(String(payload.content).replace(/\s/g, ""));
      } catch {
        return "";
      }
    }
    return payload;
  }

  function versionFromAppSource(source) {
    const match = String(source || "").match(
      /\bconst\s+APP_VERSION\s*=\s*["']([^"']+)["']/,
    );
    return normaliseVersion(match?.[1]);
  }

  function versionFromUpdateResponse(body, kind) {
    const decoded = decodeGitHubFilePayload(body);
    if (kind === "manifest") return validatedUpdateManifest(decoded)?.version || "";
    return versionFromAppSource(decoded);
  }

  async function requestPublishedVersion(requester, signal) {
    const sources = [
      { url: UPDATE_MANIFEST_URL, kind: "manifest" },
      { url: UPDATE_APP_SOURCE_URL, kind: "source" },
      { url: UPDATE_RAW_MANIFEST_URL, kind: "manifest" },
      { url: UPDATE_RAW_APP_SOURCE_URL, kind: "source" },
    ];
    let lastError = new Error("No published Canopy version could be read");

    for (const source of sources) {
      if (signal?.aborted) throw lastError;
      try {
        const response = await requester(source.url, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          lastError = new Error(`GitHub returned ${response.status} for ${source.kind}`);
          continue;
        }
        const version = versionFromUpdateResponse(await response.text(), source.kind);
        if (version) return { version, source: source.kind };
        lastError = new Error(`GitHub returned an invalid Canopy ${source.kind}`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  function updateCheckIsDue(now = Date.now()) {
    if (state.settings.checkForUpdates === false) return false;
    const lastSuccess = Date.parse(state.metadata.lastUpdateCheckAt || "");
    if (Number.isFinite(lastSuccess) && now - lastSuccess < UPDATE_CHECK_INTERVAL_MS) return false;
    const lastAttempt = Date.parse(state.metadata.lastUpdateCheckAttemptAt || "");
    return !Number.isFinite(lastAttempt) || now - lastAttempt >= UPDATE_RETRY_INTERVAL_MS;
  }

  function detectedUpdatePlatform() {
    if (typeof navigator === "undefined") return "other";
    return updatePlatform(
      navigator.userAgent || "",
      navigator.userAgentData?.platform || navigator.platform || "",
    );
  }

  function updateReminderIsDue(version, now = Date.now()) {
    if (state.metadata.updateRemindVersion !== version) return true;
    const remindAfter = Date.parse(state.metadata.updateRemindAfter || "");
    return !Number.isFinite(remindAfter) || now >= remindAfter;
  }

  function showKnownUpdate(force = false) {
    const version = normaliseVersion(state.metadata.latestKnownVersion);
    if (!version || compareVersions(version, APP_VERSION) <= 0) return false;
    if (!force && !updateReminderIsDue(version)) return false;
    if (backupGateActive || $$('dialog[open]:not(#update-available-dialog)').length) return false;

    const platform = updateScriptForPlatform(detectedUpdatePlatform());
    $("#update-version-copy").textContent = `Canopy ${version} is available. You are using ${APP_VERSION}.`;
    $("#update-platform-pill").textContent = `${platform.label} detected`;
    $("#update-script-name").textContent = platform.filename;
    $("#update-script-action").textContent = platform.action;
    const dialog = $("#update-available-dialog");
    if (!dialog.open) showDialog(dialog);
    return true;
  }

  function dismissUpdateReminder() {
    const version = normaliseVersion(state.metadata.latestKnownVersion);
    if (version) {
      state.metadata.updateRemindVersion = version;
      state.metadata.updateRemindAfter = new Date(Date.now() + UPDATE_REMINDER_INTERVAL_MS).toISOString();
      persistState();
    }
    const dialog = $("#update-available-dialog");
    if (dialog?.open) closeDialog(dialog);
  }

  async function checkForAppUpdate({ force = false, fetchImpl = null } = {}) {
    if (updateCheckInFlight) return { status: "checking" };
    if (!force && state.settings.checkForUpdates === false) return { status: "disabled" };
    showKnownUpdate(force);
    if (!force && !updateCheckIsDue()) return { status: "cached" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      updateCheckResult = "offline";
      if (force) toast("Canopy is offline, so GitHub could not be checked.", "error");
      renderUpdateStatus();
      return { status: "offline" };
    }

    const requester = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!requester) return { status: "unsupported" };
    updateCheckInFlight = true;
    updateCheckResult = "";
    state.metadata.lastUpdateCheckAttemptAt = new Date().toISOString();
    persistState();
    renderUpdateStatus();

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 6000) : null;
    try {
      const manifest = await requestPublishedVersion(requester, controller?.signal);

      state.metadata.lastUpdateCheckAt = new Date().toISOString();
      state.metadata.latestKnownVersion = manifest.version;
      const hasUpdate = compareVersions(manifest.version, APP_VERSION) > 0;
      if (!hasUpdate) {
        state.metadata.updateRemindAfter = null;
        state.metadata.updateRemindVersion = null;
      }
      persistState();
      updateCheckResult = hasUpdate ? "update" : "current";
      renderUpdateStatus();
      if (hasUpdate) showKnownUpdate(true);
      else if (force) toast(`Canopy ${APP_VERSION} is up to date.`);
      return { status: hasUpdate ? "update" : "current", version: manifest.version };
    } catch (error) {
      updateCheckResult = "error";
      renderUpdateStatus();
      if (force) toast("The update check failed. Canopy will keep working normally.", "error");
      console.info("Canopy update check skipped.", error);
      return { status: "error" };
    } finally {
      if (timeout) clearTimeout(timeout);
      updateCheckInFlight = false;
      renderUpdateStatus();
    }
  }

  function persistState() {
    state.metadata.lastSavedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      toast("This browser could not save the latest change.", "error");
      console.error(error);
    }
  }

  function mutate(message, callback) {
    callback();
    state = normalizeState(state);
    persistState();
    renderAll();
    if (message) toast(message);
  }

  function toast(message, type = "success") {
    const region = $("#toast-region");
    const item = document.createElement("div");
    item.className = `toast ${type === "error" ? "error" : ""}`;
    item.textContent = message;
    region.append(item);
    setTimeout(() => item.remove(), 3600);
  }

  function money(value, options = {}) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: state.settings.currency || "AUD",
      minimumFractionDigits: options.cents === false ? 0 : 2,
      maximumFractionDigits: options.cents === false ? 0 : 2,
      signDisplay: options.sign ? "always" : "auto",
    }).format(amount);
  }

  function accountById(id) {
    return state.accounts.find((item) => item.id === id);
  }

  function categoryById(id) {
    return state.categories.find((item) => item.id === id);
  }

  function expenseById(id) {
    return state.expenses.find((item) => item.id === id);
  }

  function incomeById(id) {
    return state.incomeSources.find((item) => item.id === id);
  }

  function goalById(id) {
    return state.goals.find((item) => item.id === id);
  }

  function itemSchedule(item) {
    return {
      mode: item.schedule?.mode || "recurring",
      interval: Math.max(1, Number(item.schedule?.interval) || 1),
      unit: item.schedule?.unit || "months",
      anchorDate: item.schedule?.anchorDate || localDate(),
      expectedDates: Array.isArray(item.schedule?.expectedDates)
        ? item.schedule.expectedDates
        : [],
    };
  }

  function scheduleOccurrences(item, startDate, endDate) {
    if (item.active === false) return [];
    const schedule = itemSchedule(item);
    if (schedule.mode === "irregular") {
      return schedule.expectedDates
        .filter((entry) => entry?.date >= startDate && entry?.date <= endDate)
        .map((entry) => ({
          date: entry.date,
          amount: Number(entry.amount ?? item.amount) || 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    const occurrences = [];
    const anchor = schedule.anchorDate;
    let cursor = anchor;
    let stepIndex = 0;
    const step = () => {
      stepIndex += 1;
      if (schedule.unit === "days") cursor = addDays(anchor, schedule.interval * stepIndex);
      else if (schedule.unit === "weeks") cursor = addDays(anchor, schedule.interval * 7 * stepIndex);
      else if (schedule.unit === "years") cursor = addYears(anchor, schedule.interval * stepIndex);
      else cursor = addMonths(anchor, schedule.interval * stepIndex);
    };

    let guard = 0;
    while (cursor < startDate && guard < 10000) {
      step();
      guard += 1;
    }
    while (cursor <= endDate && guard < 10000) {
      occurrences.push({ date: cursor, amount: Number(item.amount) || 0 });
      step();
      guard += 1;
    }
    return occurrences;
  }

  function scheduleOccurrencesOnDate(item, date) {
    if (item.active === false) return [];
    const schedule = itemSchedule(item);
    if (schedule.mode === "irregular") {
      return schedule.expectedDates
        .filter((entry) => entry?.date === date)
        .map((entry) => ({
          date,
          amount: Number(entry.amount ?? item.amount) || 0,
        }));
    }

    const anchor = schedule.anchorDate;
    if (!anchor || date < anchor) return [];
    let matches = false;
    if (["days", "weeks"].includes(schedule.unit)) {
      const intervalDays = schedule.interval * (schedule.unit === "weeks" ? 7 : 1);
      matches = daysBetween(anchor, date) % intervalDays === 0;
    } else if (schedule.unit === "years") {
      const anchorDate = parseDate(anchor);
      const candidateDate = parseDate(date);
      const yearDifference = candidateDate.getFullYear() - anchorDate.getFullYear();
      matches =
        yearDifference >= 0 &&
        yearDifference % schedule.interval === 0 &&
        addYears(anchor, yearDifference) === date;
    } else {
      const anchorDate = parseDate(anchor);
      const candidateDate = parseDate(date);
      const monthDifference =
        (candidateDate.getFullYear() - anchorDate.getFullYear()) * 12 +
        candidateDate.getMonth() -
        anchorDate.getMonth();
      matches =
        monthDifference >= 0 &&
        monthDifference % schedule.interval === 0 &&
        addMonths(anchor, monthDifference) === date;
    }
    return matches ? [{ date, amount: Number(item.amount) || 0 }] : [];
  }

  function scheduleText(item) {
    const schedule = itemSchedule(item);
    if (schedule.mode === "irregular") {
      const count = schedule.expectedDates.length;
      return `${count} expected date${count === 1 ? "" : "s"}`;
    }
    const unit = schedule.unit.replace(/s$/, "");
    return schedule.interval === 1 ? `Every ${unit}` : `Every ${schedule.interval} ${schedule.unit}`;
  }

  function periodTransactions(period = activePeriod()) {
    return state.transactions.filter((transaction) => transaction.periodId === period.id);
  }

  function transactionEffect(transaction, accountId) {
    if (!transaction) return 0;
    const amount = Number(transaction.amount) || 0;
    if (transaction.type === "expense") return transaction.accountId === accountId ? -amount : 0;
    if (transaction.type === "refund" || transaction.type === "income") {
      return transaction.accountId === accountId ? amount : 0;
    }
    if (transaction.type === "transfer") {
      if (transaction.accountId === accountId) return -amount;
      if (transaction.toAccountId === accountId) return amount;
    }
    return 0;
  }

  function isSavingsAccount(accountId) {
    return accountById(accountId)?.kind === "savings";
  }

  function inferTransferDirection(transaction) {
    if (transaction?.type !== "transfer") return "not-transfer";
    const fromSavings = isSavingsAccount(transaction.accountId);
    const toSavings = isSavingsAccount(transaction.toAccountId);
    if (!fromSavings && toSavings) return "savings-in";
    if (fromSavings && !toSavings) return "savings-out";
    return "account-transfer";
  }

  function transferDirection(transaction) {
    if (transaction?.type !== "transfer") return "not-transfer";
    return ["savings-in", "savings-out", "account-transfer"].includes(transaction.transferNature)
      ? transaction.transferNature
      : inferTransferDirection(transaction);
  }

  function transferStats(transactions = []) {
    const stats = {
      totalCount: 0,
      intoSavings: 0,
      intoCount: 0,
      outOfSavings: 0,
      outCount: 0,
      otherTransfers: 0,
      otherCount: 0,
      netSavings: 0,
    };
    transactions
      .filter((transaction) => transaction.type === "transfer")
      .forEach((transaction) => {
        const amount = Number(transaction.amount) || 0;
        const direction = transferDirection(transaction);
        stats.totalCount += 1;
        if (direction === "savings-in") {
          stats.intoSavings = roundMoney(stats.intoSavings + amount);
          stats.intoCount += 1;
        } else if (direction === "savings-out") {
          stats.outOfSavings = roundMoney(stats.outOfSavings + amount);
          stats.outCount += 1;
        } else {
          stats.otherTransfers = roundMoney(stats.otherTransfers + amount);
          stats.otherCount += 1;
        }
      });
    stats.netSavings = roundMoney(stats.intoSavings - stats.outOfSavings);
    return stats;
  }

  function inferGoalTransferEffect(transaction) {
    if (transaction?.type !== "transfer" || !transaction.goalId) return 0;
    const goal = goalById(transaction.goalId);
    if (!goal) return 0;
    const amount = Number(transaction.amount) || 0;
    if (goal.accountId) {
      if (transaction.toAccountId === goal.accountId) return amount;
      if (transaction.accountId === goal.accountId) return -amount;
      return 0;
    }
    const direction = transferDirection(transaction);
    if (direction === "savings-in") return amount;
    if (direction === "savings-out") return -amount;
    return 0;
  }

  function goalTransferEffect(transaction) {
    if (transaction?.type !== "transfer" || !transaction.goalId) return 0;
    const storedEffect = Number(transaction.goalContribution);
    return Number.isFinite(storedEffect) ? storedEffect : inferGoalTransferEffect(transaction);
  }

  function normaliseGoalImpacts(impacts) {
    if (!Array.isArray(impacts)) return [];
    return impacts
      .map((impact) => ({
        goalId: String(impact?.goalId || ""),
        amount: roundMoney(impact?.amount),
        reason: String(impact?.reason || "unlinked-savings-withdrawal"),
      }))
      .filter((impact) => impact.goalId && Number.isFinite(impact.amount) && impact.amount < -0.005);
  }

  function goalImpactEntries(transaction) {
    if (transaction?.type !== "transfer") return [];
    if (transaction.goalId) {
      const amount = goalTransferEffect(transaction);
      return Math.abs(amount) >= 0.005
        ? [{ goalId: transaction.goalId, amount, automatic: false }]
        : [];
    }
    return normaliseGoalImpacts(transaction.goalImpacts).map((impact) => ({
      ...impact,
      automatic: true,
    }));
  }

  function transactionGoalEffect(transaction, goalId) {
    return roundMoney(
      goalImpactEntries(transaction)
        .filter((impact) => impact.goalId === goalId)
        .reduce((sum, impact) => sum + impact.amount, 0),
    );
  }

  function automaticGoalImpactsForState(
    transaction,
    goals,
    accounts,
    goalAmounts = new Map(goals.map((goal) => [goal.id, Number(goal.currentAmount) || 0])),
  ) {
    if (
      transaction?.type !== "transfer" ||
      transaction.goalId ||
      Number(transaction.amount) <= 0
    ) {
      return [];
    }
    const source = accounts.find((account) => account.id === transaction.accountId);
    const destination = accounts.find((account) => account.id === transaction.toAccountId);
    if (source?.kind !== "savings" || destination?.kind === "savings") return [];

    const hasSingleSavingsPool =
      accounts.filter((account) => account.kind === "savings").length === 1;
    const candidates = goals
      .filter(
        (goal) =>
          (!goal.startDate || !transaction.date || transaction.date >= goal.startDate) &&
          (goal.accountId === source.id || (!goal.accountId && hasSingleSavingsPool)),
      )
      .map((goal) => ({
        goal,
        available: Math.max(0, roundMoney(goalAmounts.get(goal.id) || 0)),
      }))
      .filter((entry) => entry.available >= 0.005);
    const totalAvailable = roundMoney(
      candidates.reduce((sum, entry) => sum + entry.available, 0),
    );
    const totalImpact = Math.min(roundMoney(transaction.amount), totalAvailable);
    if (totalImpact < 0.005) return [];

    let remaining = totalImpact;
    return candidates
      .map((entry, index) => {
        const proportional =
          index === candidates.length - 1
            ? remaining
            : roundMoney(totalImpact * (entry.available / totalAvailable));
        const allocated = Math.min(entry.available, remaining, proportional);
        remaining = roundMoney(remaining - allocated);
        return {
          goalId: entry.goal.id,
          amount: roundMoney(-allocated),
          reason: "unlinked-savings-withdrawal",
        };
      })
      .filter((impact) => impact.amount < -0.005);
  }

  function automaticGoalImpacts(transaction, previousTransaction = null) {
    const goalAmounts = new Map(
      state.goals.map((goal) => [goal.id, Math.max(0, Number(goal.currentAmount) || 0)]),
    );
    goalImpactEntries(previousTransaction).forEach((impact) => {
      goalAmounts.set(
        impact.goalId,
        Math.max(0, roundMoney((goalAmounts.get(impact.goalId) || 0) - impact.amount)),
      );
    });
    return automaticGoalImpactsForState(
      transaction,
      state.goals,
      state.accounts,
      goalAmounts,
    );
  }

  function transactionMutationMessage(action, transaction) {
    const impacts = normaliseGoalImpacts(transaction?.goalImpacts);
    if (!impacts.length) return action;
    const total = Math.abs(
      roundMoney(impacts.reduce((sum, impact) => sum + impact.amount, 0)),
    );
    if (impacts.length === 1) {
      const goal = goalById(impacts[0].goalId);
      return `${action} ${money(total)} was automatically removed from ${
        goal?.name || "the associated savings goal"
      }.`;
    }
    return `${action} ${money(total)} was automatically shared across ${impacts.length} savings goals.`;
  }

  function applyGoalTransferChange(previousTransaction, nextTransaction) {
    const changes = new Map();
    for (const [transaction, multiplier] of [
      [previousTransaction, -1],
      [nextTransaction, 1],
    ]) {
      goalImpactEntries(transaction).forEach((impact) => {
        const effect = impact.amount * multiplier;
        changes.set(
          impact.goalId,
          roundMoney((changes.get(impact.goalId) || 0) + effect),
        );
      });
    }
    changes.forEach((amount, goalId) => {
      const goal = goalById(goalId);
      if (!goal || Math.abs(amount) < 0.005) return;
      goal.currentAmount = roundMoney(Math.max(0, Number(goal.currentAmount || 0) + amount));
      goal.updatedAt = new Date().toISOString();
    });
  }

  function validateGoalTransfer(transaction) {
    if (transaction.type !== "transfer" || !transaction.goalId) return "";
    const goal = goalById(transaction.goalId);
    if (!goal) return "Choose an existing savings goal.";
    if (goal.accountId) {
      if (![transaction.accountId, transaction.toAccountId].includes(goal.accountId)) {
        return `A transfer linked to “${goal.name}” must move into or out of its associated account.`;
      }
      return "";
    }
    if (inferGoalTransferEffect(transaction) === 0) {
      return `A transfer linked to “${goal.name}” needs one savings account.`;
    }
    return "";
  }

  function accountBalance(accountId, period = activePeriod()) {
    const opening = Number(period.openingBalances?.[accountId]) || 0;
    const transactionDelta = periodTransactions(period).reduce(
      (sum, transaction) => sum + transactionEffect(transaction, accountId),
      0,
    );
    const adjustmentDelta = state.adjustments
      .filter(
        (adjustment) =>
          adjustment.periodId === period.id &&
          adjustment.accountId === accountId &&
          adjustment.resolved !== true,
      )
      .reduce((sum, adjustment) => sum + Number(adjustment.delta || 0), 0);
    return roundMoney(opening + transactionDelta + adjustmentDelta);
  }

  function unresolvedAdjustment(accountId, period = activePeriod()) {
    return state.adjustments
      .filter(
        (adjustment) =>
          adjustment.periodId === period.id &&
          adjustment.accountId === accountId &&
          adjustment.resolved !== true,
      )
      .reduce((sum, adjustment) => sum + Number(adjustment.delta || 0), 0);
  }

  function recordBalanceDifference(details, period = activePeriod()) {
    const accountId = String(details?.accountId || "");
    const account = accountById(accountId);
    const reported = roundMoney(details?.reportedBalance);
    if (!account || !Number.isFinite(reported)) {
      return { status: "invalid", expected: null, reported };
    }

    const expected = accountBalance(accountId, period);
    const delta = roundMoney(reported - expected);
    if (Math.abs(delta) < 0.005) {
      return { status: "matches", expected, reported, delta: 0 };
    }

    const note = String(details?.note || "").trim();
    const recordedAt = new Date().toISOString();
    const reusable = state.adjustments
      .slice()
      .reverse()
      .find(
        (adjustment) =>
          adjustment.periodId === period.id &&
          adjustment.accountId === accountId &&
          adjustment.resolved === true &&
          Math.abs(roundMoney(adjustment.reportedBalance) - reported) < 0.005 &&
          String(adjustment.note || "").trim() === note,
      );
    const values = {
      periodId: period.id,
      accountId,
      date: String(details?.date || localDate()),
      expectedBalance: expected,
      reportedBalance: reported,
      delta,
      note,
      resolved: false,
    };

    if (reusable) {
      if (reusable.resolvedAt) {
        reusable.resolutionHistory = [
          ...(Array.isArray(reusable.resolutionHistory) ? reusable.resolutionHistory : []),
          reusable.resolvedAt,
        ];
      }
      Object.assign(reusable, values, { reopenedAt: recordedAt });
      delete reusable.resolvedAt;
      return { status: "restored", adjustment: reusable, expected, reported, delta };
    }

    const adjustment = {
      id: uid("adjustment"),
      ...values,
      createdAt: recordedAt,
    };
    state.adjustments.push(adjustment);
    return { status: "created", adjustment, expected, reported, delta };
  }

  function transactionAllocations(transaction) {
    if (!["expense", "refund"].includes(transaction.type)) return [];
    const sign = transaction.type === "refund" ? -1 : 1;
    if (Array.isArray(transaction.splits) && transaction.splits.length) {
      return transaction.splits.map((split) => ({
        categoryId: split.categoryId || UNCATEGORISED_CATEGORY_ID,
        linkedPlanId: split.linkedPlanId || "",
        amount: sign * (Number(split.amount) || 0),
      }));
    }
    return [
      {
        categoryId: transaction.categoryId || UNCATEGORISED_CATEGORY_ID,
        linkedPlanId: transaction.linkedPlanId || "",
        amount: sign * (Number(transaction.amount) || 0),
      },
    ];
  }

  function plannedOccurrenceProgress(period = activePeriod(), today = localDate(), entriesOverride = null) {
    const archivedEntries = (type, collection) => {
      const snapshots = period.archiveOccurrences?.[type];
      if (period.status !== "archived" || !Array.isArray(snapshots)) return null;
      return snapshots.map((occurrence) => {
        const currentItem = collection.find((candidate) => candidate.id === occurrence.itemId);
        const item = {
          ...(currentItem || {}),
          id: occurrence.itemId,
          name:
            occurrence.name ||
            currentItem?.name ||
            (type === "income" ? "Archived income" : "Archived expense"),
          accountId: occurrence.accountId || currentItem?.accountId || "",
          categoryId:
            occurrence.categoryId || currentItem?.categoryId || UNCATEGORISED_CATEGORY_ID,
          isEstimate: Object.prototype.hasOwnProperty.call(occurrence, "isEstimate")
            ? occurrence.isEstimate === true
            : currentItem?.isEstimate === true,
        };
        return { ...occurrence, item, type: type === "expenses" ? "expense" : "income", actual: 0 };
      });
    };
    const archivedExpenses = archivedEntries("expenses", state.expenses);
    const archivedIncome = archivedEntries("income", state.incomeSources);
    const entries = entriesOverride || [
      ...(archivedExpenses ||
        state.expenses.flatMap((item) =>
          scheduleOccurrences(item, period.startDate, period.endDate).map((occurrence) => ({
            ...occurrence,
            item,
            type: "expense",
            actual: 0,
          })),
        )),
      ...(archivedIncome ||
        state.incomeSources.flatMap((item) =>
          scheduleOccurrences(item, period.startDate, period.endDate).map((occurrence) => ({
            ...occurrence,
            item,
            type: "income",
            actual: 0,
          })),
        )),
    ];
    const entriesByPlan = new Map();
    entries.forEach((entry) => {
      const key = `${entry.type}:${entry.item.id}`;
      if (!entriesByPlan.has(key)) entriesByPlan.set(key, []);
      entriesByPlan.get(key).push(entry);
    });
    entriesByPlan.forEach((planEntries) => {
      planEntries.sort((a, b) => a.date.localeCompare(b.date));
    });

    const assignContribution = (type, itemId, date, amount) => {
      if (!itemId || Math.abs(Number(amount) || 0) < 0.005) return;
      const candidates = entriesByPlan.get(`${type}:${itemId}`) || [];
      if (!candidates.length) return;
      const target = candidates.reduce((closest, candidate) => {
        const candidateDistance = Math.abs(daysBetween(candidate.date, date));
        const closestDistance = Math.abs(daysBetween(closest.date, date));
        return candidateDistance < closestDistance ? candidate : closest;
      });
      target.actual = roundMoney(target.actual + Number(amount || 0));
    };

    periodTransactions(period).forEach((transaction) => {
      if (transaction.type === "income") {
        assignContribution(
          "income",
          transaction.linkedPlanId,
          transaction.date,
          Number(transaction.amount) || 0,
        );
        return;
      }
      transactionAllocations(transaction).forEach((allocation) => {
        assignContribution(
          "expense",
          allocation.linkedPlanId,
          transaction.date,
          allocation.amount,
        );
      });
    });

    return entries
      .map((entry) => {
        const planned = roundMoney(entry.amount);
        const actual = Math.max(0, roundMoney(entry.actual));
        const difference = roundMoney(actual - planned);
        const estimated = entry.type === "expense" && entry.item.isEstimate === true;
        let status = "pending";
        if (actual >= 0.005) {
          if (actual < planned - 0.005) status = "partial";
          else if (Math.abs(difference) < 0.005) status = "exact";
          else status = "over";
        }
        if (estimated && entry.date < today) {
          if (actual < 0.005) status = "skipped";
          else if (actual < planned - 0.005) status = "under";
        }
        const overdue = !estimated && status === "pending" && entry.date < today;
        const tone =
          overdue || (status === "over" && entry.type === "expense")
            ? "bad"
            : status === "partial"
              ? "warn"
              : ["exact", "over", "under", "skipped"].includes(status)
                ? "good"
                : "neutral";
        return {
          ...entry,
          planned,
          actual,
          difference,
          estimated,
          status,
          overdue,
          tone,
        };
      })
      .sort((a, b) => {
        const aGroup = a.status === "pending" ? 0 : 1;
        const bGroup = b.status === "pending" ? 0 : 1;
        if (aGroup !== bGroup) return aGroup - bGroup;
        if (aGroup === 1) {
          const statusOrder = { partial: 0, over: 1, under: 2, skipped: 3, exact: 4 };
          const statusDifference = statusOrder[a.status] - statusOrder[b.status];
          if (statusDifference) return statusDifference;
        }
        return a.date.localeCompare(b.date) || a.item.name.localeCompare(b.item.name);
      });
  }

  function expenseBufferSnapshot(accountId, period = activePeriod(), today = localDate()) {
    const remainingEntries = plannedOccurrenceProgress(period, today)
      .filter((entry) => entry.type === "expense" && entry.item.accountId === accountId)
      .map((entry) => ({
        ...entry,
        remaining:
          entry.estimated && ["under", "skipped", "exact", "over"].includes(entry.status)
            ? 0
            : roundMoney(Math.max(0, entry.planned - entry.actual)),
      }))
      .filter((entry) => entry.remaining >= 0.005);
    const remainingExpected = roundMoney(
      remainingEntries.reduce((sum, entry) => sum + entry.remaining, 0),
    );
    const overdueEntries = remainingEntries.filter(
      (entry) => entry.date < today && !entry.estimated,
    );
    const partialEntries = remainingEntries.filter((entry) => entry.status === "partial");
    const currentBalance = accountById(accountId) ? accountBalance(accountId, period) : 0;
    const difference = roundMoney(currentBalance - remainingExpected);

    return {
      accountId,
      currentBalance,
      remainingExpected,
      difference,
      shortfall: roundMoney(Math.max(0, -difference)),
      buffer: roundMoney(Math.max(0, difference)),
      remainingCount: remainingEntries.length,
      overdueCount: overdueEntries.length,
      overdueRemaining: roundMoney(
        overdueEntries.reduce((sum, entry) => sum + entry.remaining, 0),
      ),
      partialCount: partialEntries.length,
      partialRemaining: roundMoney(
        partialEntries.reduce((sum, entry) => sum + entry.remaining, 0),
      ),
      remainingEntries,
    };
  }

  function reportingCategoryId(categoryId) {
    return categoryById(categoryId)?.id || UNCATEGORISED_CATEGORY_ID;
  }

  function categoryTotalsForPeriod(period = activePeriod()) {
    const totals = new Map();
    periodTransactions(period).forEach((transaction) => {
      transactionAllocations(transaction).forEach((allocation) => {
        const categoryId = reportingCategoryId(allocation.categoryId);
        totals.set(categoryId, roundMoney((totals.get(categoryId) || 0) + allocation.amount));
      });
    });
    return totals;
  }

  function uncategorisedActivity(period = activePeriod()) {
    const transactions = new Set();
    let spending = 0;
    let income = 0;
    periodTransactions(period).forEach((transaction) => {
      if (["expense", "refund"].includes(transaction.type)) {
        transactionAllocations(transaction).forEach((allocation) => {
          if (reportingCategoryId(allocation.categoryId) === UNCATEGORISED_CATEGORY_ID) {
            transactions.add(transaction);
            spending = roundMoney(spending + allocation.amount);
          }
        });
      } else if (
        transaction.type === "income" &&
        reportingCategoryId(transaction.categoryId) === UNCATEGORISED_CATEGORY_ID
      ) {
        transactions.add(transaction);
        income = roundMoney(income + Number(transaction.amount || 0));
      }
    });
    return { count: transactions.size, spending, income };
  }

  function renderUncategorisedAlert(selector, period = activePeriod()) {
    const element = $(selector);
    const activity = uncategorisedActivity(period);
    element.hidden = activity.count === 0;
    if (!activity.count) {
      element.innerHTML = "";
      return;
    }
    const amounts = [];
    if (Math.abs(activity.spending) >= 0.005) {
      amounts.push(
        activity.spending >= 0
          ? `${money(activity.spending)} spending`
          : `${money(Math.abs(activity.spending))} net refunds`,
      );
    }
    if (Math.abs(activity.income) >= 0.005) amounts.push(`${money(activity.income)} income`);
    element.innerHTML = `
      <div>
        <span class="eyebrow">Needs a category</span>
        <strong>${activity.count} uncategorised entr${
          activity.count === 1 ? "y" : "ies"
        } this cycle</strong>
        <p>${
          amounts.length
            ? `${escapeHtml(amounts.join(" and "))} can still be assigned for clearer insights.`
            : "Assign these entries for clearer insights."
        }</p>
      </div>
      <button class="text-button" type="button" data-go-view="transactions">Review transactions</button>`;
  }

  function periodSummaryFromTransactions(period, budgetIncome, budgetExpenses) {
    const transactions = periodTransactions(period);
    const actualIncome = transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const actualExpenses = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const refunds = transactions
      .filter((transaction) => transaction.type === "refund")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const netActualExpenses = actualExpenses - refunds;

    return {
      budgetIncome: roundMoney(budgetIncome),
      actualIncome: roundMoney(actualIncome),
      incomeDifference: roundMoney(actualIncome - budgetIncome),
      budgetExpenses: roundMoney(budgetExpenses),
      actualExpenses: roundMoney(netActualExpenses),
      expenseDifference: roundMoney(budgetExpenses - netActualExpenses),
      budgetNet: roundMoney(budgetIncome - budgetExpenses),
      actualNet: roundMoney(actualIncome - netActualExpenses),
      netDifference: roundMoney(actualIncome - netActualExpenses - (budgetIncome - budgetExpenses)),
    };
  }

  function plannedTotalsForPeriod(period) {
    const budgetIncome = state.incomeSources.reduce(
      (sum, item) =>
        sum +
        scheduleOccurrences(item, period.startDate, period.endDate).reduce(
          (subtotal, occurrence) => subtotal + occurrence.amount,
          0,
        ),
      0,
    );
    const budgetExpenses = state.expenses.reduce(
      (sum, item) =>
        sum +
        scheduleOccurrences(item, period.startDate, period.endDate).reduce(
          (subtotal, occurrence) => subtotal + occurrence.amount,
          0,
        ),
      0,
    );
    return { budgetIncome: roundMoney(budgetIncome), budgetExpenses: roundMoney(budgetExpenses) };
  }

  function summaryForPeriod(period = activePeriod()) {
    if (period.status === "archived" && period.archiveSummary) return clone(period.archiveSummary);
    const { budgetIncome, budgetExpenses } = plannedTotalsForPeriod(period);
    return periodSummaryFromTransactions(period, budgetIncome, budgetExpenses);
  }

  function archivedBudgetTotal(period, type) {
    const summaryKey = type === "income" ? "budgetIncome" : "budgetExpenses";
    const cached = Number(period.archiveSummary?.[summaryKey]);
    if (Number.isFinite(cached)) return cached;
    const occurrences = period.archiveOccurrences?.[type];
    if (Array.isArray(occurrences)) {
      return roundMoney(
        occurrences.reduce((total, occurrence) => total + Number(occurrence.amount || 0), 0),
      );
    }
    return plannedTotalsForPeriod(period)[summaryKey];
  }

  function transactionAccountDeltas(previousTransaction, nextTransaction) {
    const accountIds = new Set(
      [
        previousTransaction?.accountId,
        previousTransaction?.toAccountId,
        nextTransaction?.accountId,
        nextTransaction?.toAccountId,
      ].filter(Boolean),
    );
    return new Map(
      [...accountIds]
        .map((accountId) => [
          accountId,
          roundMoney(
            transactionEffect(nextTransaction, accountId) -
              transactionEffect(previousTransaction, accountId),
          ),
        ])
        .filter(([, delta]) => Math.abs(delta) >= 0.005),
    );
  }

  function refreshArchivedPeriodAfterTransactionChange(previousTransaction, nextTransaction) {
    const periodId = previousTransaction?.periodId || nextTransaction?.periodId;
    const period = periodById(periodId);
    if (!period || period.status !== "archived") {
      return { refreshed: false, periodId, accountDeltas: {} };
    }

    const budgetIncome = archivedBudgetTotal(period, "income");
    const budgetExpenses = archivedBudgetTotal(period, "expenses");
    period.archiveSummary = periodSummaryFromTransactions(period, budgetIncome, budgetExpenses);

    const accountDeltas = transactionAccountDeltas(previousTransaction, nextTransaction);
    const orderedPeriods = state.periods
      .slice()
      .sort(
        (a, b) =>
          String(a.startDate || "").localeCompare(String(b.startDate || "")) ||
          String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      );
    const editedIndex = orderedPeriods.findIndex((item) => item.id === period.id);

    if (!period.closingBalances || typeof period.closingBalances !== "object") {
      period.closingBalances = Object.fromEntries(
        state.accounts.map((account) => [account.id, accountBalance(account.id, period)]),
      );
    } else {
      accountDeltas.forEach((delta, accountId) => {
        period.closingBalances[accountId] = roundMoney(
          (Number(period.closingBalances[accountId]) || 0) + delta,
        );
      });
    }

    orderedPeriods.slice(editedIndex + 1).forEach((laterPeriod) => {
      if (!laterPeriod.openingBalances || typeof laterPeriod.openingBalances !== "object") {
        laterPeriod.openingBalances = {};
      }
      accountDeltas.forEach((delta, accountId) => {
        laterPeriod.openingBalances[accountId] = roundMoney(
          (Number(laterPeriod.openingBalances[accountId]) || 0) + delta,
        );
      });
      if (laterPeriod.status !== "archived") return;
      if (!laterPeriod.closingBalances || typeof laterPeriod.closingBalances !== "object") {
        laterPeriod.closingBalances = Object.fromEntries(
          state.accounts.map((account) => [account.id, accountBalance(account.id, laterPeriod)]),
        );
        return;
      }
      accountDeltas.forEach((delta, accountId) => {
        laterPeriod.closingBalances[accountId] = roundMoney(
          (Number(laterPeriod.closingBalances[accountId]) || 0) + delta,
        );
      });
    });

    period.archiveEditedAt = new Date().toISOString();
    period.archiveRevision = Math.max(0, Number(period.archiveRevision) || 0) + 1;
    return {
      refreshed: true,
      periodId: period.id,
      accountDeltas: Object.fromEntries(accountDeltas),
    };
  }

  function cyclePaceSnapshot(
    period = activePeriod(),
    today = localDate(),
    summary = summaryForPeriod(period),
  ) {
    const budgetExpenses = Math.max(0, roundMoney(summary.budgetExpenses));
    const actualExpenses = Math.max(0, roundMoney(summary.actualExpenses));
    const remainingPlanned = roundMoney(Math.max(0, budgetExpenses - actualExpenses));
    const rawExpenseRatio = budgetExpenses > 0 ? actualExpenses / budgetExpenses : null;
    const expensePercent =
      rawExpenseRatio === null ? null : Math.round(rawExpenseRatio * 1000) / 10;
    const visualExpenseRatio =
      rawExpenseRatio === null
        ? actualExpenses >= 0.005
          ? 1
          : 0
        : Math.max(0, Math.min(1, rawExpenseRatio));
    const totalCycleDays = Math.max(1, daysBetween(period.startDate, period.endDate));
    const elapsedCycleDays = Math.max(
      0,
      Math.min(totalCycleDays, daysBetween(period.startDate, today)),
    );
    const elapsedPercent = Math.round((elapsedCycleDays / totalCycleDays) * 100);
    const budgetIncome = Math.max(0, roundMoney(summary.budgetIncome));
    const actualIncome = Math.max(0, roundMoney(summary.actualIncome));
    let incomeState = "received";
    if (budgetIncome < 0.005 && actualIncome < 0.005) incomeState = "none-scheduled";
    else if (budgetIncome < 0.005) incomeState = "unplanned";
    else if (actualIncome < 0.005) incomeState = "awaiting";
    else if (actualIncome < budgetIncome - 0.005) incomeState = "partial";

    return {
      budgetExpenses,
      actualExpenses,
      remainingPlanned,
      expensePercent,
      visualExpenseRatio,
      overPlan:
        budgetExpenses > 0
          ? actualExpenses > budgetExpenses + 0.005
          : actualExpenses >= 0.005,
      elapsedPercent,
      budgetIncome,
      actualIncome,
      incomeState,
      cashFlow: roundMoney(summary.actualNet),
      savingsMovement: transferStats(periodTransactions(period)).netSavings,
    };
  }

  function goalProjection(goal, today = localDate()) {
    const target = Math.max(0, Number(goal.targetAmount) || 0);
    const current = Math.max(0, Number(goal.currentAmount) || 0);
    const remaining = Math.max(0, target - current);
    const startDate = goal.startDate || today;
    const intervalDays = payIntervalDays();
    if (goal.mode === "contribution") {
      const contribution = Math.max(0, Number(goal.contributionPerPeriod) || 0);
      const periods = contribution > 0 ? Math.ceil(remaining / contribution) : Infinity;
      const projectedDate = Number.isFinite(periods)
        ? addDays(today, periods * intervalDays)
        : null;
      return {
        target,
        current,
        remaining,
        contribution,
        endDate: projectedDate,
        durationDays: projectedDate ? daysBetween(today, projectedDate) : Infinity,
      };
    }
    const endDate = goal.endDate || today;
    const daysRemaining = Math.max(0, daysBetween(today, endDate));
    const periodsRemaining = Math.max(1, Math.ceil(daysRemaining / intervalDays));
    return {
      target,
      current,
      remaining,
      contribution: roundMoney(remaining / periodsRemaining),
      endDate,
      durationDays: daysRemaining,
      startDate,
    };
  }

  function savingsCommitmentSnapshot(
    period = activePeriod(),
    today = localDate(),
    summary = summaryForPeriod(period),
  ) {
    const goals = state.goals
      .map((goal) => {
        const projection = goalProjection(goal, today);
        const contribution = roundMoney(
          Math.min(projection.remaining, Math.max(0, projection.contribution)),
        );
        return { goal, projection, contribution };
      })
      .filter(
        ({ goal, projection, contribution }) =>
          projection.remaining >= 0.005 &&
          contribution >= 0.005 &&
          (!goal.startDate || goal.startDate <= period.endDate),
      );
    const plannedSavings = roundMoney(
      goals.reduce((total, item) => total + item.contribution, 0),
    );
    const budgetedNet = roundMoney(summary.budgetNet);
    const availableAfterGoals = roundMoney(budgetedNet - plannedSavings);
    const budgetedIncome = Math.max(0, roundMoney(summary.budgetIncome));
    let status = "none";
    let reason = "no-commitments";

    if (plannedSavings >= 0.005) {
      if (budgetedIncome < 0.005) {
        status = "warn";
        reason = "no-income";
      } else if (availableAfterGoals < -0.005) {
        status = "bad";
        reason = "shortfall";
      } else if (availableAfterGoals <= 0.005) {
        status = "warn";
        reason = "fully-allocated";
      } else {
        status = "good";
        reason = "covered";
      }
    }

    return {
      budgetedNet,
      plannedSavings,
      availableAfterGoals,
      shortfall: roundMoney(Math.max(0, -availableAfterGoals)),
      budgetedIncome,
      goals: goals.map(({ goal, contribution }) => ({
        id: goal.id,
        name: goal.name,
        contribution,
      })),
      status,
      reason,
    };
  }

  function varianceStatus(difference, reference) {
    const tolerance = Math.max(5, Math.abs(Number(reference) || 0) * 0.05);
    if (difference > tolerance) return "good";
    if (difference < -tolerance) return "bad";
    return "warn";
  }

  function matchingPlan(description, type = "expense") {
    const text = String(description || "").trim().toLowerCase();
    if (!text) return null;
    const collection = type === "income" ? state.incomeSources : state.expenses;
    const candidates = collection
      .flatMap((item) => {
        const words = [
          item.name,
          ...(Array.isArray(item.keywords) ? item.keywords : String(item.keywords || "").split(",")),
        ]
          .map((word) => String(word || "").trim().toLowerCase())
          .filter(Boolean);
        return words.map((word) => ({ item, word }));
      })
      .filter((candidate) => text.includes(candidate.word))
      .sort((a, b) => b.word.length - a.word.length);
    return candidates[0]?.item || null;
  }

  function themeCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderAll() {
    applyTheme(state.settings.theme);
    applySidebarState();
    renderPeriodHeader();
    renderDashboard();
    renderTransactions();
    renderPlan();
    renderGoals();
    renderArchive();
    renderSettings();
    if (currentView === "insights") renderInsights();
    if (currentView === "calendar") initialiseCalendar({ refresh: true });
  }

  function applyTheme(theme) {
    const valid = THEME_ORDER.includes(theme) ? theme : "power";
    document.documentElement.dataset.theme = valid;
    $$("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.themeChoice === valid);
    });
  }

  function applySidebarState() {
    const collapsed = state.settings.sidebarCollapsed === true;
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    const button = $("#sidebar-collapse");
    if (!button) return;
    const action = collapsed ? "Expand" : "Collapse";
    button.setAttribute("aria-label", `${action} navigation`);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = `${action} navigation`;
    $(".nav-label", button).textContent = action;
  }

  function renderPeriodHeader() {
    const period = activePeriod();
    $("#period-label").textContent = `${formatCompactDate(period.startDate)} – ${formatDate(
      period.endDate,
      { month: "short", year: "numeric" },
    )}`;
  }

  function emptyState(title, copy, icon = "○") {
    return `<div class="empty-state"><span class="empty-icon">${icon}</span><h2>${escapeHtml(
      title,
    )}</h2><p>${escapeHtml(copy)}</p></div>`;
  }

  function renderDashboard() {
    const period = activePeriod();
    const summary = summaryForPeriod(period);
    const today = localDate();
    const hasPlan = state.expenses.length > 0 || state.incomeSources.length > 0;
    $("#onboarding-banner").hidden = hasPlan;
    renderUncategorisedAlert("#dashboard-uncategorised-alert", period);
    $("#dashboard-eyebrow").textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());

    const primary = incomeById(state.settings.primaryIncomeId);
    $("#dashboard-greeting").textContent = primary
      ? `${primary.name} cycle, clearly mapped`
      : "Your money at a glance";
    $("#dashboard-subtitle").textContent =
      today > period.endDate
        ? "This cycle has ended. Review the numbers, then archive it when you are ready."
        : "See what is due, what has moved, and what is still yours.";

    const cards = [
      {
        label: "Income",
        actual: summary.actualIncome,
        budget: summary.budgetIncome,
        difference: summary.incomeDifference,
        status: varianceStatus(summary.incomeDifference, summary.budgetIncome),
      },
      {
        label: "Expenses",
        actual: summary.actualExpenses,
        budget: summary.budgetExpenses,
        difference: summary.expenseDifference,
        status: varianceStatus(summary.expenseDifference, summary.budgetExpenses),
      },
      {
        label: "Net",
        actual: summary.actualNet,
        budget: summary.budgetNet,
        difference: summary.netDifference,
        status: varianceStatus(summary.netDifference, summary.budgetNet),
      },
    ];
    $("#score-grid").innerHTML = cards
      .map(
        (card) => `
          <article class="score-card ${card.status}">
            <span class="label">${card.label}</span>
            <strong class="score-value">${money(card.actual)}</strong>
            <div class="score-comparison">
              <div><span>Budgeted</span><strong>${money(card.budget)}</strong></div>
              <div><span>Difference</span><strong>${money(card.difference, { sign: true })}</strong></div>
            </div>
          </article>`,
      )
      .join("");
    renderSavingsAffordability(period, summary, today);

    const daysLeft = daysBetween(today, period.endDate);
    $("#cycle-days-left").textContent =
      daysLeft < 0
        ? "Cycle ended"
        : daysLeft === 0
          ? "Ends today"
          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
    renderCyclePace(period, summary, today);

    renderExpenseBuffer(period);
    renderUpcoming(period);
    renderDashboardAccounts(period);
    renderRecentTransactions(period);
  }

  function renderSavingsAffordability(period, summary, today) {
    const snapshot = savingsCommitmentSnapshot(period, today, summary);
    const container = $("#savings-affordability-strip");
    const names = snapshot.goals.map((goal) => goal.name);
    const goalNames =
      names.length > 2
        ? `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`
        : names.join(" and ");
    let headline = "No active goal contribution is planned";
    let detail = "Add a goal when you are ready to give part of your budgeted net a purpose.";

    if (snapshot.reason === "covered") {
      headline = "Your plan covers this cycle's goal contributions";
      detail = `${goalNames} ${
        names.length === 1 ? "is" : "are"
      } funded with budgeted income after expenses.`;
    } else if (snapshot.reason === "shortfall") {
      headline = `Goal commitments are ${money(snapshot.shortfall)} above budgeted net`;
      detail = `${goalNames} ${
        names.length === 1 ? "needs" : "need"
      } more than this cycle's planned surplus. Extend a target date, lower a contribution, or review the plan.`;
    } else if (snapshot.reason === "fully-allocated") {
      headline = "Goal commitments use the full budgeted net";
      detail = `${goalNames} leave no planned breathing room after expenses this cycle.`;
    } else if (snapshot.reason === "no-income") {
      headline = "No income is scheduled to fund these goals this cycle";
      detail = `${goalNames} and planned expenses need ${money(
        snapshot.shortfall,
      )} more than this cycle's scheduled income. Money already in your accounts may cover it; check the Expense Buffer before transferring.`;
    }

    container.className = `savings-affordability-strip tone-${snapshot.status}`;
    container.innerHTML = `
      <div class="savings-affordability-copy">
        <span class="eyebrow">Savings commitments</span>
        <h2 id="savings-affordability-title">${escapeHtml(headline)}</h2>
        <p>${escapeHtml(detail)}</p>
      </div>
      <div class="savings-affordability-math" aria-label="Savings affordability calculation">
        <div>
          <span>Budgeted net</span>
          <strong>${money(snapshot.budgetedNet)}</strong>
        </div>
        <span class="math-operator" aria-hidden="true">−</span>
        <div>
          <span>Planned savings</span>
          <strong>${money(snapshot.plannedSavings)}</strong>
        </div>
        <span class="math-operator" aria-hidden="true">=</span>
        <div class="available-after-goals">
          <span>Available after goals</span>
          <strong>${money(snapshot.availableAfterGoals)}</strong>
        </div>
      </div>
      <button class="text-button savings-affordability-action" type="button" data-go-view="goals">
        ${snapshot.goals.length ? "Review goals" : "Create a goal"}
      </button>`;
  }

  function renderCyclePace(period, summary, today) {
    const pace = cyclePaceSnapshot(period, today, summary);
    const ring = $("#pace-ring");
    const hasExpensePlan = pace.budgetExpenses >= 0.005;
    ring.style.setProperty("--progress", `${pace.visualExpenseRatio * 360}deg`);
    ring.classList.toggle("is-over-plan", pace.overPlan);
    ring.classList.toggle("has-no-plan", !hasExpensePlan && pace.actualExpenses >= 0.005);
    ring.classList.toggle(
      "is-empty",
      !hasExpensePlan && pace.actualExpenses < 0.005,
    );
    ring.setAttribute("aria-valuemin", "0");
    ring.setAttribute(
      "aria-valuemax",
      String(Math.max(1, pace.budgetExpenses, pace.actualExpenses)),
    );
    ring.setAttribute("aria-valuenow", String(pace.actualExpenses));
    ring.setAttribute(
      "aria-valuetext",
      hasExpensePlan
        ? `${money(pace.actualExpenses)} of ${money(
            pace.budgetExpenses,
          )} planned expenses recorded, ${Math.round(pace.expensePercent)} percent`
        : pace.actualExpenses >= 0.005
          ? `${money(pace.actualExpenses)} recorded with no planned expense total`
          : "No planned or recorded expenses",
    );
    $("#pace-percentage").textContent = hasExpensePlan
      ? `${Math.round(pace.expensePercent)}%`
      : pace.actualExpenses >= 0.005
        ? "No plan"
        : "0%";
    $("#pace-ring-label").textContent = hasExpensePlan
      ? "of expense plan spent"
      : pace.actualExpenses >= 0.005
        ? "expenses recorded"
        : "no expense plan";

    const paceLegend = [
      {
        colour: pace.overPlan ? "var(--bad)" : "var(--accent)",
        label: "Spent",
        amount: pace.actualExpenses,
      },
      {
        colour: "var(--warn)",
        label: "Still planned",
        amount: pace.remainingPlanned,
      },
      {
        colour: "var(--good)",
        label: "Income received",
        amount: pace.actualIncome,
      },
      {
        colour: pace.cashFlow < -0.005 ? "var(--bad)" : "var(--good)",
        label: "Cash flow so far",
        amount: pace.cashFlow,
        sign: Math.abs(pace.cashFlow) >= 0.005,
      },
      {
        colour:
          pace.savingsMovement > 0.005
            ? "var(--good)"
            : pace.savingsMovement < -0.005
              ? "var(--bad)"
              : "var(--faint)",
        label:
          pace.savingsMovement > 0.005
            ? "Moved to savings"
            : pace.savingsMovement < -0.005
              ? "Pulled from savings"
              : "Savings movement",
        amount: Math.abs(pace.savingsMovement),
      },
    ];
    $("#pace-legend").innerHTML = paceLegend
      .map(
        (entry) =>
          `<div class="legend-row"><i style="background:${entry.colour}"></i><span>${escapeHtml(
            entry.label,
          )}</span><strong>${money(entry.amount, { sign: entry.sign })}</strong></div>`,
      )
      .join("");

    const expenseTiming = hasExpensePlan
      ? `You are ${pace.elapsedPercent}% through the cycle and have recorded ${Math.round(
          pace.expensePercent,
        )}% of planned expenses.`
      : pace.actualExpenses >= 0.005
        ? `${money(pace.actualExpenses)} of spending has been recorded without a planned expense total.`
        : "There is no planned or recorded spending in this cycle yet.";
    let noteTone = "neutral";
    let noteTitle = "Cycle income is on record";
    let noteCopy = `${expenseTiming} ${money(pace.actualIncome)} has been received this cycle.`;
    if (pace.incomeState === "none-scheduled") {
      noteTitle = "No income is scheduled in this cycle";
      noteCopy = `${expenseTiming} Spending is being funded from balances already in your accounts or from transfers. The Expense Buffer below checks whether the selected account can cover what remains.`;
    } else if (pace.incomeState === "awaiting") {
      noteTone = "warn";
      noteTitle = `${money(pace.budgetIncome)} of income is still expected`;
      noteCopy = `${expenseTiming} Cash flow so far will remain negative until that income is recorded.`;
    } else if (pace.incomeState === "partial") {
      noteTone = "warn";
      noteTitle = "Some scheduled income is still to come";
      noteCopy = `${expenseTiming} ${money(pace.actualIncome)} of ${money(
        pace.budgetIncome,
      )} scheduled income has been received.`;
    } else if (pace.incomeState === "unplanned") {
      noteTone = "good";
      noteTitle = "Income was received without a scheduled occurrence";
      noteCopy = `${expenseTiming} ${money(
        pace.actualIncome,
      )} is included in cash flow even though no income was planned for this cycle.`;
    } else {
      noteTone = "good";
      noteTitle = "Scheduled income has been received";
      noteCopy = `${expenseTiming} ${money(pace.actualIncome)} has been received against ${money(
        pace.budgetIncome,
      )} scheduled.`;
    }
    const note = $("#cycle-pace-note");
    note.className = `cycle-pace-note tone-${noteTone}`;
    note.innerHTML = `<strong>${escapeHtml(noteTitle)}</strong><span>${escapeHtml(
      noteCopy,
    )}</span>`;
  }

  function renderExpenseBuffer(period) {
    const panel = $("#expense-buffer-panel");
    const select = $("#expense-buffer-account");
    const content = $("#expense-buffer-content");
    if (!panel || !select || !content) return;

    const selectedId = state.settings.expenseBufferAccountId;
    const account = accountById(selectedId) || state.accounts[0] || null;
    select.innerHTML = state.accounts.length
      ? state.accounts
          .map(
            (item) =>
              `<option value="${escapeHtml(item.id)}" ${
                item.id === account?.id ? "selected" : ""
              }>${escapeHtml(item.name)}</option>`,
          )
          .join("")
      : '<option value="">No accounts</option>';
    select.disabled = !account;

    if (!account) {
      panel.dataset.tone = "neutral";
      content.innerHTML = emptyState(
        "No account to check",
        "Add an account and assign planned expenses to it to see an expense buffer.",
        "○",
      );
      return;
    }

    const snapshot = expenseBufferSnapshot(account.id, period);
    const isShort = snapshot.shortfall >= 0.005;
    const isExact =
      snapshot.remainingExpected >= 0.005 && Math.abs(snapshot.difference) < 0.005;
    const tone = isShort ? "bad" : "good";
    const plottedBalance = Math.max(0, snapshot.currentBalance);
    const scaleMaximum = Math.max(plottedBalance, snapshot.remainingExpected, 1) * 1.12;
    const barHeight = (amount) =>
      amount >= 0.005 ? Math.max(3, Math.min(100, (amount / scaleMaximum) * 100)) : 0;
    const balanceHeight = barHeight(plottedBalance);
    const expensesHeight = barHeight(snapshot.remainingExpected);
    const guideBottom = Math.min(balanceHeight, expensesHeight);
    const guideHeight = Math.abs(balanceHeight - expensesHeight);
    const gapAmount = Math.abs(snapshot.difference);
    const showGuide = gapAmount >= 0.005;
    const timingNotes = [];
    if (snapshot.overdueRemaining >= 0.005) {
      timingNotes.push(
        `${money(snapshot.overdueRemaining)} across ${snapshot.overdueCount} overdue ${
          snapshot.overdueCount === 1 ? "item" : "items"
        }`,
      );
    }
    if (snapshot.partialRemaining >= 0.005) {
      timingNotes.push(
        `${money(snapshot.partialRemaining)} still due on ${snapshot.partialCount} partially spent ${
          snapshot.partialCount === 1 ? "item" : "items"
        }`,
      );
    }

    let headline;
    let detail;
    if (isShort) {
      headline = `Transfer ${money(snapshot.shortfall)} into ${account.name}`;
      detail = `${account.name} cannot yet cover the ${money(
        snapshot.remainingExpected,
      )} still expected this cycle.`;
    } else if (snapshot.remainingExpected < 0.005) {
      headline = `No planned expenses left for ${account.name}`;
      detail = `${money(snapshot.currentBalance)} remains available in this account.`;
    } else if (isExact) {
      headline = `${account.name} is funded exactly`;
      detail = `The current balance matches the expenses still expected this cycle.`;
    } else {
      headline = `${money(snapshot.buffer)} buffer after planned expenses`;
      detail = `${account.name} should cover the ${money(
        snapshot.remainingExpected,
      )} still expected this cycle.`;
    }

    panel.dataset.tone = tone;
    content.innerHTML = `
      <div class="buffer-status tone-${tone}">
        <span class="buffer-status-mark" aria-hidden="true">
          ${
            isShort
              ? `<svg viewBox="0 0 24 24">
                  <path d="M12 6.5v7"></path>
                  <circle cx="12" cy="17.5" r="1"></circle>
                </svg>`
              : `<svg viewBox="0 0 24 24">
                  <path d="m6.5 12.5 3.5 3.5 7.5-8"></path>
                </svg>`
          }
        </span>
        <div>
          <strong>${escapeHtml(headline)}</strong>
          <span>${escapeHtml(detail)}</span>
          ${
            timingNotes.length
              ? `<small>${escapeHtml(`Includes ${timingNotes.join("; ")}.`)}</small>`
              : ""
          }
        </div>
      </div>
      <div
        class="buffer-chart tone-${tone}"
        role="img"
        aria-label="${escapeHtml(
          `${account.name}: current balance ${money(
            snapshot.currentBalance,
          )}; remaining expected expenses ${money(
            snapshot.remainingExpected,
          )}; ${isShort ? "shortfall" : "buffer"} ${money(gapAmount)}.`,
        )}"
      >
        <div class="buffer-bars-stage">
          <span class="buffer-grid-line buffer-grid-line-top" aria-hidden="true"></span>
          <span class="buffer-grid-line buffer-grid-line-middle" aria-hidden="true"></span>
          <span class="buffer-grid-line buffer-grid-line-base" aria-hidden="true"></span>
          ${
            showGuide
              ? `<span
                  class="buffer-gap-guide ${guideHeight < 12 ? "is-compact" : ""}"
                  style="--guide-bottom:${guideBottom}%;--guide-height:${guideHeight}%"
                  aria-hidden="true"
                ><strong>${escapeHtml(
                  `${money(gapAmount)} ${isShort ? "short" : "spare"}`,
                )}</strong></span>`
              : ""
          }
          <div class="buffer-bar-column" style="--bar-height:${balanceHeight}%">
            <span class="buffer-bar-value ${
              snapshot.currentBalance < -0.005 ? "status-bad" : ""
            }">${money(snapshot.currentBalance)}</span>
            <i
              class="buffer-bar-fill buffer-balance-bar ${
                snapshot.currentBalance < -0.005 ? "is-negative" : ""
              }"
              aria-hidden="true"
            ></i>
          </div>
          <div class="buffer-bar-column" style="--bar-height:${expensesHeight}%">
            <span class="buffer-bar-value">${money(snapshot.remainingExpected)}</span>
            <i
              class="buffer-bar-fill buffer-expenses-bar"
              aria-hidden="true"
            ></i>
          </div>
        </div>
        <div class="buffer-bar-labels" aria-hidden="true">
          <span>Current balance</span>
          <span>Expenses remaining</span>
        </div>
      </div>
      <div class="buffer-facts">
        <div><span>Available now</span><strong>${money(snapshot.currentBalance)}</strong></div>
        <div><span>Still expected</span><strong>${money(
          snapshot.remainingExpected,
        )}</strong></div>
        <div class="tone-${tone}"><span>${
          isShort ? "Transfer needed" : "Expected buffer"
        }</span><strong>${money(isShort ? snapshot.shortfall : snapshot.buffer)}</strong></div>
      </div>`;
  }

  function renderUpcoming(period) {
    const upcoming = plannedOccurrenceProgress(period);
    const rowMarkup = (entry) => {
      const account = accountById(entry.item.accountId);
      const remaining = roundMoney(entry.planned - entry.actual);
      const label = entry.overdue
        ? "Overdue"
        : entry.status === "skipped"
          ? "Estimate unused"
          : entry.status === "under"
            ? "Under estimate"
        : entry.status === "pending"
          ? entry.type === "income"
            ? "Not received yet"
            : entry.estimated
              ? "Estimated spending"
              : "Not paid yet"
          : entry.status === "partial"
            ? entry.type === "income"
              ? "Underpaid"
              : "Partially spent"
            : entry.status === "exact"
              ? entry.type === "income"
                ? "Exact pay"
                : "Paid as planned"
              : entry.type === "income"
                ? "Overpaid"
                : "Overspent";
      const detail =
        entry.status === "skipped"
          ? `No spending recorded; ${money(entry.planned)} remained unspent`
          : entry.status === "under"
            ? `${money(Math.abs(entry.difference))} below the estimate`
        : entry.status === "pending"
          ? `${money(entry.planned)} planned`
          : entry.status === "partial"
            ? entry.type === "income"
              ? `${money(Math.max(0, remaining))} short`
              : `${money(Math.max(0, remaining))} remaining`
            : entry.status === "exact"
              ? "Matched the planned amount"
              : `${money(Math.abs(entry.difference))} ${
                  entry.type === "income" ? "above plan" : "over plan"
                }`;
      const progress =
        entry.planned > 0 ? Math.min(100, Math.max(0, (entry.actual / entry.planned) * 100)) : 0;
      const progressMax = Math.max(0, entry.planned);
      const progressNow = Math.min(progressMax, Math.max(0, entry.actual));
      return `
        <article class="upcoming-status-row tone-${entry.tone}">
          <div class="upcoming-item-main">
            <div class="item-icon">${entry.type === "income" ? "↓" : "↑"}</div>
            <div class="item-copy">
              <strong>${escapeHtml(entry.item.name)}</strong>
              <span>${formatCompactDate(entry.date)} · ${escapeHtml(account?.name || "No account")}</span>
            </div>
          </div>
          <div class="upcoming-progress">
            <div class="upcoming-progress-heading">
              <span class="upcoming-status-badge">${escapeHtml(label)}</span>
              <strong>${
                entry.status === "pending"
                  ? money(entry.planned)
                  : `${money(entry.actual)} / ${money(entry.planned)}`
              }</strong>
            </div>
            <div
              class="upcoming-progress-track"
              role="progressbar"
              aria-label="${escapeHtml(`${entry.item.name}: ${label}`)}"
              aria-valuemin="0"
              aria-valuemax="${escapeHtml(progressMax)}"
              aria-valuenow="${escapeHtml(progressNow)}"
              aria-valuetext="${escapeHtml(`${money(entry.actual)} of ${money(entry.planned)}: ${label}`)}"
            ><i style="width:${progress.toFixed(2)}%"></i></div>
            <small>${escapeHtml(detail)}</small>
          </div>
        </article>`;
    };
    const groupMarkup = (label, entries) =>
      entries.length
        ? `<section class="upcoming-group">
            <div class="upcoming-group-heading">
              <span>${escapeHtml(label)}</span>
              <strong>${entries.length}</strong>
            </div>
            ${entries.map(rowMarkup).join("")}
          </section>`
        : "";
    const outstanding = upcoming.filter((entry) => entry.status === "pending");
    const recorded = upcoming.filter((entry) => entry.status !== "pending");

    $("#upcoming-list").innerHTML = upcoming.length
      ? `${groupMarkup("Still to come", outstanding)}${groupMarkup("Activity recorded", recorded)}`
      : emptyState(
          "Nothing scheduled",
          "Add recurring expenses or income sources to map this cycle.",
          "◫",
        );
  }

  function resetCalendarDataCache() {
    calendarProgressCache = new Map();
    calendarTransactionsByDate = new Map();
    state.transactions.forEach((transaction) => {
      const date = String(transaction.date || "");
      if (!date) return;
      if (!calendarTransactionsByDate.has(date)) calendarTransactionsByDate.set(date, []);
      calendarTransactionsByDate.get(date).push(transaction);
    });
  }

  function calendarPlannedEntries(period) {
    if (period.status === "archived" && period.archiveOccurrences) return null;
    const earliestStoredStart = state.periods
      .map((item) => item.startDate)
      .filter(Boolean)
      .sort()[0];
    if (period.status === "historical-gap" && period.endDate < earliestStoredStart) return [];
    const entries = [];
    for (let date = period.startDate; date <= period.endDate; date = addDays(date, 1)) {
      state.expenses.forEach((item) => {
        scheduleOccurrencesOnDate(item, date).forEach((occurrence) => {
          entries.push({ ...occurrence, item, type: "expense", actual: 0 });
        });
      });
      state.incomeSources.forEach((item) => {
        scheduleOccurrencesOnDate(item, date).forEach((occurrence) => {
          entries.push({ ...occurrence, item, type: "income", actual: 0 });
        });
      });
    }
    return entries;
  }

  function calendarProgressForPeriod(period) {
    const key = `${period.id}:${period.archiveRevision || 0}`;
    if (calendarProgressCache.has(key)) return calendarProgressCache.get(key);
    const entries = calendarPlannedEntries(period);
    const progress = plannedOccurrenceProgress(period, localDate(), entries);
    calendarProgressCache.set(key, progress);
    return progress;
  }

  function calendarEntryPresentation(entry) {
    if (entry.overdue) {
      return {
        label: entry.type === "income" ? "Income overdue" : "Overdue",
        detail: `${money(entry.actual)} of ${money(entry.planned)} recorded`,
      };
    }
    if (entry.status === "pending") {
      return {
        label:
          entry.type === "income"
            ? "Income expected"
            : entry.estimated
              ? "Spending estimate"
              : "Payment due",
        detail: `${money(entry.planned)} planned`,
      };
    }
    if (entry.status === "partial") {
      return {
        label: entry.type === "income" ? "Underpaid" : "Partially paid",
        detail: `${money(entry.actual)} of ${money(entry.planned)} recorded`,
      };
    }
    if (entry.status === "exact") {
      return {
        label: entry.type === "income" ? "Income received" : "Paid as planned",
        detail: `${money(entry.actual)} matched the plan`,
      };
    }
    if (entry.status === "under") {
      return {
        label: "Under estimate",
        detail: `${money(entry.actual)} spent; ${money(Math.abs(entry.difference))} below estimate`,
      };
    }
    if (entry.status === "skipped") {
      return {
        label: "Estimate unused",
        detail: `No spending recorded against the ${money(entry.planned)} estimate`,
      };
    }
    return {
      label: entry.type === "income" ? "Income above plan" : "Overspent",
      detail: `${money(entry.actual)} against ${money(entry.planned)} planned`,
    };
  }

  function calendarPlannedEventMarkup(entry) {
    const presentation = calendarEntryPresentation(entry);
    const account = accountById(entry.item.accountId);
    const title = `${entry.item.name} — ${presentation.label}. ${presentation.detail}${
      account ? ` from ${account.name}` : ""
    }.`;
    return `<div class="calendar-event calendar-planned-event tone-${entry.tone}" title="${escapeHtml(
      title,
    )}">
      <span aria-hidden="true">${entry.type === "income" ? "↓" : "↑"}</span>
      <strong>${escapeHtml(entry.item.name)}</strong>
      <em>${
        entry.status === "pending" && !entry.overdue
          ? money(entry.planned)
          : `${money(entry.actual)}/${money(entry.planned)}`
      }</em>
    </div>`;
  }

  function calendarProgressEntryForTransaction(transaction, type, itemId) {
    if (!itemId) return null;
    const period = periodById(transaction.periodId) || calendarPeriodForDate(transaction.date);
    const candidates = calendarProgressForPeriod(period).filter(
      (entry) => entry.type === type && entry.item.id === itemId,
    );
    if (!candidates.length) return null;
    return candidates.reduce((closest, candidate) =>
      Math.abs(daysBetween(candidate.date, transaction.date)) <
      Math.abs(daysBetween(closest.date, transaction.date))
        ? candidate
        : closest,
    );
  }

  function calendarTransactionEvents(transaction) {
    if (transaction.type === "income") {
      const source = incomeById(transaction.linkedPlanId);
      const progress = calendarProgressEntryForTransaction(
        transaction,
        "income",
        transaction.linkedPlanId,
      );
      const unplanned = !source;
      return [
        {
          appearance: "income",
          tone: progress?.tone === "warn" ? "warn" : "good",
          icon: "+",
          label: source?.name || transaction.description || "Unplanned income",
          amount: Number(transaction.amount) || 0,
          title: `${unplanned ? "Unplanned income" : source.name} arrived on ${formatDate(
            transaction.date,
          )}: ${money(transaction.amount)}${
            transaction.description ? ` — ${transaction.description}` : ""
          }.`,
        },
      ];
    }
    if (transaction.type === "transfer") {
      const direction = transferDirection(transaction);
      const source = accountById(transaction.accountId);
      const destination = accountById(transaction.toAccountId);
      const tone =
        direction === "savings-in"
          ? "good"
          : direction === "savings-out"
            ? "bad"
            : "neutral";
      const label =
        direction === "savings-in"
          ? "Moved to savings"
          : direction === "savings-out"
            ? "Withdrawn from savings"
            : `${source?.name || "Account"} → ${destination?.name || "account"}`;
      return [
        {
          appearance: "transfer",
          tone,
          icon: direction === "savings-in" ? "+" : direction === "savings-out" ? "−" : "↔",
          label,
          amount: Number(transaction.amount) || 0,
          title: `${label}: ${money(transaction.amount)} on ${formatDate(transaction.date)}.`,
        },
      ];
    }
    if (!["expense", "refund"].includes(transaction.type)) return [];

    const grouped = new Map();
    transactionAllocations(transaction).forEach((allocation) => {
      if (!allocation.linkedPlanId) return;
      grouped.set(
        allocation.linkedPlanId,
        roundMoney((grouped.get(allocation.linkedPlanId) || 0) + allocation.amount),
      );
    });
    return [...grouped.entries()].map(([itemId, allocated]) => {
      const item = expenseById(itemId);
      const progress = calendarProgressEntryForTransaction(transaction, "expense", itemId);
      const isRefund = allocated < 0 || transaction.type === "refund";
      const isEstimate = progress ? progress.estimated : item?.isEstimate === true;
      const amount = Math.abs(allocated);
      const label = item?.name || progress?.item.name || transaction.description || "Planned expense";
      return {
        appearance: isEstimate
          ? "flexible-estimate"
          : isRefund
            ? "fixed-refund"
            : "paid-obligation",
        tone: isRefund ? "good" : progress?.tone || "neutral",
        icon: isRefund ? "+" : isEstimate ? "−" : "✓",
        label: isRefund ? `${label} refund` : label,
        amount,
        title: `${isRefund ? "Refunded" : "Paid"} ${money(amount)} for ${label} on ${formatDate(
          transaction.date,
        )}${progress ? `. ${calendarEntryPresentation(progress).label}` : ""}.`,
      };
    });
  }

  function calendarMovementEventMarkup(event) {
    const appearance = [
      "income",
      "transfer",
      "flexible-estimate",
      "fixed-refund",
      "paid-obligation",
    ].includes(event.appearance)
      ? event.appearance
      : "movement";
    return `<div class="calendar-event calendar-movement-event is-${appearance} tone-${event.tone}" title="${escapeHtml(
      event.title,
    )}">
      <span aria-hidden="true">${event.icon}</span>
      <strong>${escapeHtml(event.label)}</strong>
      <em>${money(event.amount)}</em>
    </div>`;
  }

  function calendarNetIndicatorMarkup(period, date) {
    if (period.virtual || period.status !== "archived" || date !== period.endDate) return "";
    const summary = summaryForPeriod(period);
    const tone = varianceStatus(summary.netDifference, summary.budgetNet);
    const direction =
      tone === "good" ? "ahead of plan" : tone === "bad" ? "behind plan" : "close to plan";
    const label = `Cycle ended ${direction}. Budgeted net ${money(
      summary.budgetNet,
    )}; actual net ${money(summary.actualNet)}; difference ${money(summary.netDifference, {
      sign: true,
    })}.`;
    return `<button class="calendar-net-indicator tone-${tone}" type="button" aria-label="${escapeHtml(
      label,
    )}">
      <span aria-hidden="true">${tone === "good" ? "+" : tone === "bad" ? "−" : "="}</span>
      <span class="calendar-net-tooltip" role="tooltip">
        <strong>Cycle ${escapeHtml(direction)}</strong>
        <span>Budgeted net <b>${money(summary.budgetNet)}</b></span>
        <span>Actual net <b>${money(summary.actualNet)}</b></span>
        <span>Difference <b>${money(summary.netDifference, { sign: true })}</b></span>
      </span>
    </button>`;
  }

  function calendarCycleMarkerMarkup(period, date) {
    if (date !== period.startDate) return "";
    if (period.startDate <= activePeriod().endDate) {
      return '<span class="calendar-cycle-kicker">Cycle</span>';
    }
    const plannedExpenses = roundMoney(
      calendarProgressForPeriod(period)
        .filter((entry) => entry.type === "expense")
        .reduce((total, entry) => total + entry.planned, 0),
    );
    return `<span class="calendar-cycle-budget" title="${escapeHtml(
      `${money(plannedExpenses)} of expenses budgeted for ${formatDate(
        period.startDate,
      )} to ${formatDate(period.endDate)}.`,
    )}"><strong>${money(plannedExpenses, { cents: false })}</strong><small>planned</small></span>`;
  }

  function calendarMoreEventsMarkup(hiddenEvents) {
    if (!hiddenEvents.length) return "";
    const descriptions = hiddenEvents.map((event) => event.description);
    const details = descriptions.join("; ");
    const countLabel = `+${hiddenEvents.length} more`;
    return `<span class="calendar-more-events" tabindex="0" aria-label="${escapeHtml(
      `${hiddenEvents.length} more item${hiddenEvents.length === 1 ? "" : "s"} on this day. ${details}`,
    )}" title="${escapeHtml(details)}">
      <strong>${countLabel}</strong>
      <small>Hover to view</small>
      <span class="calendar-more-tooltip" role="tooltip">
        <b>More on this day</b>
        ${descriptions.map((description) => `<span>${escapeHtml(description)}</span>`).join("")}
      </span>
    </span>`;
  }

  function calendarDayMarkup(date) {
    const today = localDate();
    const period = calendarPeriodForDate(date);
    const cycleLength = Math.max(1, daysBetween(period.startDate, period.endDate) + 1);
    const cycleOffset = Math.round(
      daysBetween(activePeriod().startDate, period.startDate) / cycleLength,
    );
    const planned = calendarProgressForPeriod(period).filter((entry) => entry.date === date);
    const visiblePlanned = planned.filter((entry) => {
      if (entry.type === "income") return entry.actual < 0.005;
      if (entry.estimated) return entry.status === "pending" && entry.date >= today;
      return !["exact", "over"].includes(entry.status);
    });
    const movements = (calendarTransactionsByDate.get(date) || []).flatMap(
      calendarTransactionEvents,
    );
    const eventMarkup = [
      ...movements.map((event) => ({
        markup: calendarMovementEventMarkup(event),
        description: `${event.label}: ${money(event.amount)}`,
      })),
      ...visiblePlanned.map((entry) => ({
        markup: calendarPlannedEventMarkup(entry),
        description: `${entry.item.name}: ${calendarEntryPresentation(entry).label}`,
      })),
    ];
    const visible = eventMarkup.slice(0, 3);
    const hidden = eventMarkup.slice(3);
    const dateObject = parseDate(date);
    const isMonthStart = dateObject.getDate() === 1;
    const classes = [
      "calendar-day",
      date === today ? "is-today" : "",
      date < today ? "is-past" : "",
      [5, 6].includes((dateObject.getDay() + 6) % 7) ? "is-weekend" : "",
      Math.abs(cycleOffset) % 2 === 1 ? "is-cycle-shaded" : "",
      date === period.startDate ? "is-cycle-start" : "",
      date === period.endDate ? "is-cycle-end" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const fullDate = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dateObject);
    return `<div class="${classes}" data-date="${date}" aria-label="${escapeHtml(fullDate)}">
      <div class="calendar-day-heading">
        <span class="calendar-date-number">${dateObject.getDate()}</span>
        ${
          isMonthStart
            ? `<strong class="calendar-month-kicker">${new Intl.DateTimeFormat(undefined, {
                month: "short",
              }).format(dateObject)}</strong>`
            : ""
        }
        ${calendarCycleMarkerMarkup(period, date)}
        ${calendarNetIndicatorMarkup(period, date)}
      </div>
      <div class="calendar-day-events">
        ${visible.map((event) => event.markup).join("")}
        ${calendarMoreEventsMarkup(hidden)}
      </div>
    </div>`;
  }

  function calendarWeekMarkup(weekStart) {
    return `<div class="calendar-week" data-week-start="${weekStart}">
      ${Array.from({ length: 7 }, (_, index) => calendarDayMarkup(addDays(weekStart, index))).join("")}
    </div>`;
  }

  function calendarRowHeight() {
    return $("#calendar-week-list .calendar-week")?.getBoundingClientRect().height || 124;
  }

  function updateCalendarVisibleRange() {
    const scroll = $("#calendar-scroll");
    const rows = $$("#calendar-week-list .calendar-week");
    const label = $("#calendar-range");
    if (!scroll || !rows.length || !label) return;
    const scrollBounds = scroll.getBoundingClientRect();
    const headerHeight = $("#calendar-weekdays")?.offsetHeight || 0;
    const visible = rows.filter((row) => {
      const bounds = row.getBoundingClientRect();
      return bounds.bottom > scrollBounds.top + headerHeight && bounds.top < scrollBounds.bottom;
    });
    const first = visible[0] || rows[0];
    const last = visible.at(-1) || rows.at(-1);
    const start = first.dataset.weekStart;
    const end = addDays(last.dataset.weekStart, 6);
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const firstLabel = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: sameYear ? undefined : "numeric",
    }).format(startDate);
    const lastLabel = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(endDate);
    label.textContent = `${firstLabel} – ${lastLabel}`;
  }

  function renderCalendarRows({ preserveScroll = true } = {}) {
    const list = $("#calendar-week-list");
    const scroll = $("#calendar-scroll");
    if (!list || !scroll) return;
    const previousTop = scroll.scrollTop;
    resetCalendarDataCache();
    list.innerHTML = calendarWeekStarts.map(calendarWeekMarkup).join("");
    if (preserveScroll) scroll.scrollTop = previousTop;
    updateCalendarVisibleRange();
  }

  function initialiseCalendar({ force = false, refresh = false } = {}) {
    const scroll = $("#calendar-scroll");
    if (!scroll) return;
    if (calendarReady && !force) {
      if (refresh) renderCalendarRows();
      else updateCalendarVisibleRange();
      return;
    }
    const currentWeek = startOfCalendarWeek(localDate());
    const firstWeek = addDays(currentWeek, -CALENDAR_CURRENT_WEEK_INDEX * 7);
    calendarWeekStarts = Array.from({ length: CALENDAR_INITIAL_WEEKS }, (_, index) =>
      addDays(firstWeek, index * 7),
    );
    calendarReady = true;
    renderCalendarRows({ preserveScroll: false });
    requestAnimationFrame(() => {
      scroll.scrollTop =
        (CALENDAR_CURRENT_WEEK_INDEX - 1) * calendarRowHeight();
      updateCalendarVisibleRange();
    });
  }

  function extendCalendar(direction) {
    const scroll = $("#calendar-scroll");
    const list = $("#calendar-week-list");
    if (!scroll || !list || !calendarWeekStarts.length) return;
    if (direction === "up") {
      const anchor = $("#calendar-week-list .calendar-week");
      const anchorTop = anchor?.getBoundingClientRect().top || 0;
      const first = calendarWeekStarts[0];
      const added = Array.from({ length: CALENDAR_BATCH_WEEKS }, (_, index) =>
        addDays(first, -(CALENDAR_BATCH_WEEKS - index) * 7),
      );
      calendarWeekStarts.unshift(...added);
      list.insertAdjacentHTML("afterbegin", added.map(calendarWeekMarkup).join(""));
      if (calendarWeekStarts.length > CALENDAR_MAX_WEEKS) {
        calendarWeekStarts.splice(-CALENDAR_BATCH_WEEKS);
        $$("#calendar-week-list .calendar-week")
          .slice(-CALENDAR_BATCH_WEEKS)
          .forEach((row) => row.remove());
      }
      if (anchor) scroll.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
      return;
    }

    const last = calendarWeekStarts.at(-1);
    const added = Array.from({ length: CALENDAR_BATCH_WEEKS }, (_, index) =>
      addDays(last, (index + 1) * 7),
    );
    calendarWeekStarts.push(...added);
    list.insertAdjacentHTML("beforeend", added.map(calendarWeekMarkup).join(""));
    if (calendarWeekStarts.length > CALENDAR_MAX_WEEKS) {
      const retainedAnchor = $$("#calendar-week-list .calendar-week")[CALENDAR_BATCH_WEEKS];
      const anchorTop = retainedAnchor?.getBoundingClientRect().top || 0;
      calendarWeekStarts.splice(0, CALENDAR_BATCH_WEEKS);
      $$("#calendar-week-list .calendar-week")
        .slice(0, CALENDAR_BATCH_WEEKS)
        .forEach((row) => row.remove());
      if (retainedAnchor) {
        scroll.scrollTop += retainedAnchor.getBoundingClientRect().top - anchorTop;
      }
    }
  }

  function handleCalendarScroll() {
    if (calendarScrollFrame) return;
    calendarScrollFrame = requestAnimationFrame(() => {
      calendarScrollFrame = null;
      const scroll = $("#calendar-scroll");
      if (!scroll) return;
      const rowHeight = calendarRowHeight();
      const threshold = rowHeight * 4;
      if (scroll.scrollTop < threshold) extendCalendar("up");
      else if (scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - threshold) {
        extendCalendar("down");
      }
      updateCalendarVisibleRange();
    });
  }

  function renderDashboardAccounts(period) {
    $("#account-list").innerHTML = state.accounts.length
      ? state.accounts
          .map((account) => {
            const balance = accountBalance(account.id, period);
            const discrepancy = unresolvedAdjustment(account.id, period);
            return `
              <div>
                <div class="account-row">
                  <div class="item-main">
                    <div class="account-icon" style="color:${escapeHtml(account.color || "var(--accent)")};background:color-mix(in srgb, ${escapeHtml(
                      account.color || "var(--accent)",
                    )} 14%, transparent)">${escapeHtml(account.name.slice(0, 1).toUpperCase())}</div>
                    <div class="item-copy">
                      <strong>${escapeHtml(account.name)}</strong>
                      <span>${escapeHtml(account.kind || "Account")}</span>
                    </div>
                  </div>
                  <strong class="account-balance">${money(balance)}</strong>
                </div>
                ${
                  Math.abs(discrepancy) >= 0.005
                    ? `<div class="discrepancy-row">${money(
                        discrepancy,
                        { sign: true },
                      )} is unaccounted for in this cycle.</div>`
                    : ""
                }
              </div>`;
          })
          .join("")
      : emptyState("No accounts yet", "Add the accounts you want to track.", "▤");
  }

  function renderRecentTransactions(period) {
    const recent = periodTransactions(period)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6);
    $("#recent-transactions").innerHTML = recent.length
      ? recent.map(transactionListItem).join("")
      : emptyState("No movement yet", "Add a transaction when money moves.", "↕");
  }

  function transactionListItem(transaction) {
    const account = accountById(transaction.accountId);
    const destination = accountById(transaction.toAccountId);
    const presentation = transactionPresentation(transaction);
    const accountText =
      transaction.type === "transfer"
        ? `${account?.name || "Unknown"} → ${destination?.name || "Unknown"}`
        : account?.name || "Unknown account";
    return `
      <div class="stack-item">
        <div class="item-main">
          <div class="item-icon">${presentation.icon}</div>
          <div class="item-copy">
            <strong>${escapeHtml(transaction.description)}</strong>
            <span>${formatCompactDate(transaction.date)} · ${escapeHtml(accountText)}</span>
          </div>
        </div>
        <strong class="item-amount ${escapeHtml(presentation.className)}">${escapeHtml(
          presentation.prefix,
        )}${money(transaction.amount)}</strong>
      </div>`;
  }

  function transactionPresentation(transaction) {
    if (transaction.type === "transfer") {
      const direction = transferDirection(transaction);
      if (direction === "savings-in") {
        return { icon: "↗", prefix: "+", className: "transfer savings-in", label: "Saved" };
      }
      if (direction === "savings-out") {
        return {
          icon: "↘",
          prefix: "−",
          className: "transfer savings-out",
          label: "Savings withdrawal",
        };
      }
      return { icon: "↔", prefix: "", className: "transfer", label: "Transfer" };
    }
    if (transaction.type === "expense") {
      return { icon: "−", prefix: "−", className: "expense", label: "Expense" };
    }
    return {
      icon: "+",
      prefix: "+",
      className: transaction.type,
      label: transaction.type === "income" ? "Income" : "Refund",
    };
  }

  function optionList(items, selectedId, blankLabel = "Choose…") {
    return [
      `<option value="">${escapeHtml(blankLabel)}</option>`,
      ...items.map(
        (item) =>
          `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(
            item.name,
          )}</option>`,
      ),
    ].join("");
  }

  function categoryOptions(selectedId, type = "both") {
    const categories = state.categories.filter((category) => {
      if (category.id === UNCATEGORISED_CATEGORY_ID) return false;
      return (
        category.type === "both" ||
        type === "both" ||
        (type === "income" ? category.type === "income" : category.type === "expense")
      );
    });
    const selected = selectedId || UNCATEGORISED_CATEGORY_ID;
    return [
      `<option value="${UNCATEGORISED_CATEGORY_ID}" ${
        selected === UNCATEGORISED_CATEGORY_ID ? "selected" : ""
      }>Uncategorised</option>`,
      ...categories.map(
        (category) =>
          `<option value="${escapeHtml(category.id)}" ${
            category.id === selected ? "selected" : ""
          }>${escapeHtml(category.name)}</option>`,
      ),
    ].join("");
  }

  function manageableCategories() {
    return state.categories.filter((category) => category.id !== UNCATEGORISED_CATEGORY_ID);
  }

  function reassignCategoryReferences(categoryId) {
    let reassigned = 0;
    state.transactions.forEach((transaction) => {
      if (transaction.categoryId === categoryId) {
        transaction.categoryId = UNCATEGORISED_CATEGORY_ID;
        reassigned += 1;
      }
      transaction.splits?.forEach((split) => {
        if (split.categoryId === categoryId) {
          split.categoryId = UNCATEGORISED_CATEGORY_ID;
          reassigned += 1;
        }
      });
    });
    state.expenses.forEach((expense) => {
      if (expense.categoryId === categoryId) {
        expense.categoryId = UNCATEGORISED_CATEGORY_ID;
        reassigned += 1;
      }
    });
    state.incomeSources.forEach((income) => {
      if (income.categoryId === categoryId) {
        income.categoryId = UNCATEGORISED_CATEGORY_ID;
        reassigned += 1;
      }
    });
    return reassigned;
  }

  function renderTransactionSelects() {
    const quickForm = $("#quick-transaction-form");
    const transactionForm = $("#transaction-form");
    const accountOptions = optionList(state.accounts, "", "Choose account");
    quickForm.elements.accountId.innerHTML = accountOptions;
    quickForm.elements.toAccountId.innerHTML = accountOptions;
    quickForm.elements.goalId.innerHTML = optionList(state.goals, "", "No savings goal");
    transactionForm.elements.accountId.innerHTML = accountOptions;
    transactionForm.elements.toAccountId.innerHTML = accountOptions;
    transactionForm.elements.goalId.innerHTML = optionList(state.goals, "", "No savings goal");
    renderQuickCategoryOptions();
    renderTransactionPlanOptions();
    syncQuickTransactionTypeFields();
  }

  function renderQuickCategoryOptions() {
    const form = $("#quick-transaction-form");
    const value = form.elements.categoryId.value;
    form.elements.categoryId.innerHTML = categoryOptions(value, form.elements.type.value);
  }

  function syncQuickTransactionTypeFields() {
    const form = $("#quick-transaction-form");
    const isTransfer = form.elements.type.value === "transfer";
    form.classList.toggle("is-transfer", isTransfer);
    $$(".quick-transfer-only", form).forEach((element) => (element.hidden = !isTransfer));
    $$(".quick-non-transfer", form).forEach((element) => (element.hidden = isTransfer));
    form.elements.toAccountId.required = isTransfer;
    $("#quick-account-label").textContent = isTransfer ? "From account" : "Account";
    if (!isTransfer) {
      form.elements.toAccountId.value = "";
      form.elements.goalId.value = "";
      renderQuickCategoryOptions();
    }
    $("#quick-suggestion").textContent = isTransfer
      ? "Transfers affect both account balances but not income or expenses."
      : "";
  }

  function panQuickEntryToFocusedControl(control) {
    const scroller = $("#quick-entry-scroll");
    if (!scroller || !control || !scroller.contains(control)) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const edgePadding = 18;
    let distance = 0;
    if (controlRect.right > scrollerRect.right - edgePadding) {
      distance = controlRect.right - scrollerRect.right + edgePadding;
    } else if (controlRect.left < scrollerRect.left + edgePadding) {
      distance = controlRect.left - scrollerRect.left - edgePadding;
    }
    if (Math.abs(distance) < 1) return;
    scroller.scrollBy({
      left: distance,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
    });
  }

  function renderTransactionPlanOptions(selectedId = "") {
    const form = $("#transaction-form");
    const type = form.elements.type.value;
    const items = type === "transfer" ? [] : type === "income" ? state.incomeSources : state.expenses;
    form.elements.linkedPlanId.innerHTML = optionList(items, selectedId, "No planned item");
    form.elements.categoryId.innerHTML = categoryOptions(
      form.elements.categoryId.value,
      type === "income" ? "income" : "expense",
    );
  }

  function renderTransactions() {
    renderTransactionSelects();
    const search = $("#transaction-search").value.trim().toLowerCase();
    const typeFilter = $("#transaction-type-filter").value;
    const transactions = periodTransactions()
      .filter((transaction) => typeFilter === "all" || transaction.type === typeFilter)
      .filter((transaction) => {
        if (!search) return true;
        const account = accountById(transaction.accountId);
        const destination = accountById(transaction.toAccountId);
        const goal = goalById(transaction.goalId);
        const automaticallyAffectedGoals = normaliseGoalImpacts(transaction.goalImpacts)
          .map((impact) => goalById(impact.goalId)?.name)
          .filter(Boolean);
        const category = categoryById(transaction.categoryId);
        return [
          transaction.description,
          transaction.reference,
          transaction.note,
          account?.name,
          destination?.name,
          goal?.name,
          ...automaticallyAffectedGoals,
          category?.name,
        ].some((value) => String(value || "").toLowerCase().includes(search));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    $("#transaction-count").textContent = `${transactions.length} transaction${
      transactions.length === 1 ? "" : "s"
    }`;
    $("#transaction-table-body").innerHTML = transactions.length
      ? transactions.map(transactionRow).join("")
      : `<tr><td colspan="7">${emptyState(
          search || typeFilter !== "all" ? "No matches" : "Your register is ready",
          search || typeFilter !== "all"
            ? "Try a different search or filter."
            : "Use the quick row above or add a detailed transaction.",
          "↕",
        )}</td></tr>`;
    renderTransferOverview(periodTransactions());
  }

  function renderTransferOverview(transactions) {
    const stats = transferStats(transactions);
    $("#transfer-count").textContent = `${stats.totalCount} transfer${
      stats.totalCount === 1 ? "" : "s"
    }`;
    $("#transfer-metrics").innerHTML = [
      ["Saved", stats.intoSavings, stats.intoCount, "good"],
      ["Pulled from savings", stats.outOfSavings, stats.outCount, stats.outCount ? "warning" : ""],
      ["Net savings movement", stats.netSavings, null, stats.netSavings >= 0 ? "good" : "bad"],
      ["Other account moves", stats.otherTransfers, stats.otherCount, ""],
    ]
      .map(
        ([label, amount, count, tone]) => `
          <div class="transfer-metric ${tone}">
            <span>${escapeHtml(label)}</span>
            <strong>${money(amount, { sign: label === "Net savings movement" })}</strong>
            ${
              count === null
                ? "<small>this cycle</small>"
                : `<small>${count} transfer${count === 1 ? "" : "s"}</small>`
            }
          </div>`,
      )
      .join("");

    let message = "No savings transfers yet this cycle.";
    if (stats.netSavings > 0 && stats.outCount === 0) {
      message = `You moved ${money(stats.netSavings)} into savings and have not pulled any back out.`;
    } else if (stats.netSavings > 0) {
      message = `You are still ${money(stats.netSavings)} ahead in savings, although ${stats.outCount} transfer${
        stats.outCount === 1 ? "" : "s"
      } moved money back out.`;
    } else if (stats.netSavings < 0) {
      message = `You pulled ${money(Math.abs(stats.netSavings))} more from savings than you added this cycle.`;
    } else if (stats.intoCount || stats.outCount) {
      message = "Transfers into and out of savings currently balance each other.";
    } else if (stats.otherCount) {
      message = "Account funding transfers are being tracked separately from spending.";
    }
    $("#transfer-message").textContent = message;
    $("#transfer-message").className = `transfer-message ${
      stats.netSavings < 0 ? "status-bad" : stats.netSavings > 0 ? "status-good" : ""
    }`;
  }

  function transactionCategoryLabel(transaction) {
    if (transaction.type === "transfer") {
      const goal = goalById(transaction.goalId);
      if (goal) return `Goal · ${goal.name}`;
      const destination = accountById(transaction.toAccountId);
      const direction = transferDirection(transaction);
      if (direction === "savings-in") return "Savings contribution";
      if (direction === "savings-out") {
        const impacts = normaliseGoalImpacts(transaction.goalImpacts);
        if (impacts.length === 1) {
          return `Reduced ${goalById(impacts[0].goalId)?.name || "savings goal"}`;
        }
        if (impacts.length > 1) return `Reduced ${impacts.length} savings goals`;
        return "Savings withdrawal";
      }
      return destination ? `Transfer to ${destination.name}` : "Transfer";
    }
    if (transaction.splits?.length) return `${transaction.splits.length}-way split`;
    const linked =
      transaction.type === "income"
        ? incomeById(transaction.linkedPlanId)
        : expenseById(transaction.linkedPlanId);
    const category = categoryById(transaction.categoryId);
    return linked?.name || category?.name || "Uncategorised";
  }

  function transactionRow(transaction) {
    const account = accountById(transaction.accountId);
    const destination = accountById(transaction.toAccountId);
    const presentation = transactionPresentation(transaction);
    const amountClass =
      transaction.type === "transfer"
        ? transferDirection(transaction) === "savings-in"
          ? "status-good"
          : transferDirection(transaction) === "savings-out"
            ? "status-warn"
            : ""
        : transaction.type === "expense"
        ? "status-bad"
        : ["income", "refund"].includes(transaction.type)
          ? "status-good"
          : "";
    return `
      <tr data-transaction-id="${escapeHtml(transaction.id)}">
        <td>${formatCompactDate(transaction.date)}</td>
        <td class="transaction-description-cell">
          <strong>${escapeHtml(transaction.description)}</strong>
          ${transaction.reference ? `<small>${escapeHtml(transaction.reference)}</small>` : ""}
        </td>
        <td>${escapeHtml(
          transaction.type === "transfer"
            ? `${account?.name || "Unknown"} → ${destination?.name || "Unknown"}`
            : account?.name || "Unknown",
        )}</td>
        <td>${escapeHtml(transactionCategoryLabel(transaction))}</td>
        <td><span class="type-badge ${escapeHtml(presentation.className)}">${escapeHtml(
          presentation.label,
        )}</span></td>
        <td class="numeric ${amountClass}">${escapeHtml(presentation.prefix)}${money(
          Number(transaction.amount),
        )}</td>
        <td class="row-actions">
          <button type="button" data-edit-transaction="${escapeHtml(transaction.id)}" aria-label="Edit ${escapeHtml(
            transaction.description,
          )}">Edit</button>
        </td>
      </tr>`;
  }

  function renderPlan() {
    $$(".tab-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.planTab === currentPlanTab);
    });
    $$(".plan-tab").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `plan-tab-${currentPlanTab}`);
    });
    renderExpenseCards();
    renderIncomeCards();
    renderAccountCards();
    renderCategoryCards();
  }

  function renderExpenseCards() {
    const period = activePeriod();
    $("#expense-card-grid").innerHTML = state.expenses.length
      ? state.expenses
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((expense) => {
            const occurrences = scheduleOccurrences(expense, period.startDate, period.endDate);
            const account = accountById(expense.accountId);
            const category = categoryById(expense.categoryId);
            const inCycle = occurrences.reduce((sum, occurrence) => sum + occurrence.amount, 0);
            return `
              <article class="entity-card">
                <div class="entity-top">
                  <div>
                    <span class="eyebrow">${escapeHtml(category?.name || "Uncategorised")}</span>
                    <h3>${escapeHtml(expense.name)}</h3>
                  </div>
                  <button class="text-button" type="button" data-edit-entity="expense" data-entity-id="${escapeHtml(
                    expense.id,
                  )}">Edit</button>
                </div>
                <strong class="entity-amount">${money(expense.amount)}</strong>
                <div class="entity-meta">
                  <span>${escapeHtml(scheduleText(expense))}</span>
                  <span>·</span>
                  <span>Next from ${formatCompactDate(itemSchedule(expense).anchorDate)}</span>
                  <span>·</span>
                  <span>${expense.isEstimate ? "Flexible estimate" : "Fixed obligation"}</span>
                </div>
                <div class="entity-card-footer">
                  <span>${escapeHtml(account?.name || "No default account")}</span>
                  <span class="pill ${inCycle > 0 ? (expense.isEstimate ? "warn" : "bad") : ""}">${
                    inCycle > 0
                      ? `${money(inCycle)} ${expense.isEstimate ? "estimated" : "due"} this cycle`
                      : "Not due this cycle"
                  }</span>
                </div>
              </article>`;
          })
          .join("")
      : emptyState(
          "No recurring expenses",
          "Add bills and regular spending with the date and interval they really use.",
          "◫",
        );
  }

  function renderIncomeCards() {
    const period = activePeriod();
    $("#income-card-grid").innerHTML = state.incomeSources.length
      ? state.incomeSources
          .slice()
          .sort((a, b) => Number(b.id === state.settings.primaryIncomeId) - Number(a.id === state.settings.primaryIncomeId))
          .map((income) => {
            const occurrences = scheduleOccurrences(income, period.startDate, period.endDate);
            const account = accountById(income.accountId);
            const inCycle = occurrences.reduce((sum, occurrence) => sum + occurrence.amount, 0);
            return `
              <article class="entity-card">
                <div class="entity-top">
                  <div>
                    <span class="eyebrow">${
                      income.id === state.settings.primaryIncomeId ? "Primary income" : "Income"
                    }</span>
                    <h3>${escapeHtml(income.name)}</h3>
                  </div>
                  <button class="text-button" type="button" data-edit-entity="income" data-entity-id="${escapeHtml(
                    income.id,
                  )}">Edit</button>
                </div>
                <strong class="entity-amount">${money(income.amount)}</strong>
                <div class="entity-meta">
                  <span>${escapeHtml(scheduleText(income))}</span>
                </div>
                <div class="entity-card-footer">
                  <span>${escapeHtml(account?.name || "No default account")}</span>
                  <span class="pill ${inCycle > 0 ? "good" : ""}">${
                    inCycle > 0 ? `${money(inCycle)} this cycle` : "Not due this cycle"
                  }</span>
                </div>
              </article>`;
          })
          .join("")
      : emptyState(
          "No income sources",
          "Add regular pay or the expected dates for irregular work.",
          "↓",
        );
  }

  function renderAccountCards() {
    const period = activePeriod();
    $("#account-card-grid").innerHTML = state.accounts.length
      ? state.accounts
          .map((account) => {
            const balance = accountBalance(account.id, period);
            const opening = Number(period.openingBalances?.[account.id]) || 0;
            const discrepancy = unresolvedAdjustment(account.id, period);
            return `
              <article class="entity-card">
                <div class="entity-top">
                  <div>
                    <span class="eyebrow">${escapeHtml(account.kind || "Account")}</span>
                    <h3>${escapeHtml(account.name)}</h3>
                  </div>
                  <button class="text-button" type="button" data-edit-entity="account" data-entity-id="${escapeHtml(
                    account.id,
                  )}">Edit</button>
                </div>
                <strong class="entity-amount">${money(balance)}</strong>
                <div class="entity-meta">
                  <span>Opened at ${money(opening)}</span>
                </div>
                ${
                  Math.abs(discrepancy) >= 0.005
                    ? `<div class="discrepancy-row">
                        <span>${money(discrepancy, { sign: true })} remains unaccounted for.</span>
                        <button class="text-button" type="button" data-resolve-account="${escapeHtml(
                          account.id,
                        )}">Resolve</button>
                      </div>`
                    : ""
                }
                <div class="entity-card-footer">
                  <span>Manual checks are kept in the archive</span>
                  <button class="text-button" type="button" data-adjust-account="${escapeHtml(
                    account.id,
                  )}">Adjust balance</button>
                </div>
              </article>`;
          })
          .join("")
      : emptyState("No accounts", "Add an account to begin tracking balances.", "▤");
  }

  function renderCategoryCards() {
    const categories = manageableCategories();
    $("#category-card-grid").innerHTML = categories.length
      ? categories
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(
            (category) => `
              <article class="category-card" style="--category-color:${escapeHtml(category.color || "#8eadcf")}">
                <i class="category-dot"></i>
                <div class="category-name">
                  <h3>${escapeHtml(category.name)}</h3>
                  <span>${escapeHtml(category.type)}</span>
                </div>
                <button class="text-button" type="button" data-edit-entity="category" data-entity-id="${escapeHtml(
                  category.id,
                )}">Edit</button>
              </article>`,
          )
          .join("")
      : emptyState("No categories", "Create categories to make patterns easier to see.", "•");
  }

  function goalTransfers(goal, period = null) {
    return state.transactions
      .filter(
        (transaction) =>
          transaction.type === "transfer" &&
          Math.abs(transactionGoalEffect(transaction, goal.id)) >= 0.005 &&
          (!period || transaction.periodId === period.id),
      )
      .sort(
        (a, b) =>
          String(a.date || "").localeCompare(String(b.date || "")) ||
          String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      );
  }

  function goalTransferNet(goal, period = null) {
    return roundMoney(
      goalTransfers(goal, period).reduce(
        (sum, transaction) => sum + transactionGoalEffect(transaction, goal.id),
        0,
      ),
    );
  }

  function goalProgressDate(goal, projection, today = localDate()) {
    const latestTransferDate = goalTransfers(goal).at(-1)?.date || "";
    const startDate = goal.startDate || today;
    const endDate = projection.endDate || addDays(today, payIntervalDays());
    let progressDate = latestTransferDate > today ? latestTransferDate : today;
    if (progressDate < startDate) progressDate = startDate;
    if (progressDate > endDate) progressDate = endDate;
    return progressDate;
  }

  function renderGoals() {
    if (!selectedGoalId || !goalById(selectedGoalId)) selectedGoalId = state.goals[0]?.id || null;
    $("#goal-list").innerHTML = state.goals.length
      ? state.goals
          .map((goal) => {
            const projection = goalProjection(goal);
            const progress =
              projection.target > 0 ? Math.min(100, (projection.current / projection.target) * 100) : 0;
            return `
              <article class="goal-card ${goal.id === selectedGoalId ? "is-selected" : ""}" data-select-goal="${escapeHtml(
                goal.id,
              )}" tabindex="0" role="button" aria-label="View ${escapeHtml(goal.name)}">
                <div class="entity-top">
                  <h3>${escapeHtml(goal.name)}</h3>
                  <span>${Math.round(progress)}%</span>
                </div>
                <div class="goal-progress" style="--goal-color:${escapeHtml(goal.color || "#75c7a0")}">
                  <i style="width:${progress}%"></i>
                </div>
                <div class="goal-meta">
                  <span>${money(projection.current)} saved</span>
                  <span>${money(projection.target)}</span>
                </div>
              </article>`;
          })
          .join("")
      : emptyState("No goals yet", "Turn something you care about into a visible plan.", "◎");

    renderGoalDetail();
  }

  function renderGoalDetail() {
    const goal = goalById(selectedGoalId);
    const container = $("#goal-detail");
    if (!goal) {
      container.innerHTML = emptyState(
        "Choose a goal",
        "Your target line and progress story will appear here.",
        "◎",
      );
      return;
    }
    const projection = goalProjection(goal);
    const account = accountById(goal.accountId);
    const progress =
      projection.target > 0 ? Math.min(100, (projection.current / projection.target) * 100) : 0;
    const today = localDate();
    const progressDate = goalProgressDate(goal, projection, today);
    const elapsed = Math.max(0, daysBetween(goal.startDate || today, progressDate));
    const total = Math.max(1, daysBetween(goal.startDate || today, projection.endDate || today));
    const expectedNow = Math.min(
      projection.target,
      Number(goal.startingAmount || 0) +
        (projection.target - Number(goal.startingAmount || 0)) * Math.min(1, elapsed / total),
    );
    const ahead = roundMoney(projection.current - expectedNow);
    const cycleTransferNet = goalTransferNet(goal, activePeriod());
    const recentGoalTransfers = goalTransfers(goal).slice(-4).reverse();
    container.innerHTML = `
      <div class="goal-detail-header">
        <div>
          <span class="eyebrow">${ahead >= 0 ? "On track" : "Needs attention"}</span>
          <h2>${escapeHtml(goal.name)}</h2>
        </div>
        <button class="quiet-button" type="button" data-edit-entity="goal" data-entity-id="${escapeHtml(
          goal.id,
        )}">Edit goal</button>
      </div>
      <div class="goal-detail-value">${money(projection.current)}</div>
      <p>${money(projection.remaining)} left to reach ${money(projection.target)}.</p>
      <div class="goal-facts">
        <div class="goal-fact"><span>Per pay cycle</span><strong>${money(
          projection.contribution,
        )}</strong></div>
        <div class="goal-fact"><span>Finish date</span><strong>${
          projection.endDate ? formatDate(projection.endDate) : "Set a contribution"
        }</strong></div>
        <div class="goal-fact"><span>Time remaining</span><strong>${
          Number.isFinite(projection.durationDays)
            ? formatDuration(projection.durationDays)
            : "Not yet calculable"
        }</strong></div>
      </div>
      <div class="callout ${ahead >= 0 ? "" : "warning"}">
        ${
          ahead >= 0
            ? `You are ${money(ahead)} ahead of the steady saving line. Nicely paced.`
            : `You are ${money(Math.abs(ahead))} behind the steady saving line. A small course correction can bring it back.`
        }
         ${account ? ` This goal is associated with ${escapeHtml(account.name)}.` : ""}
         ${
           progressDate > today
             ? ` The progress point is plotted at ${formatDate(progressDate)}, the date of the latest savings movement.`
             : ""
         }
      </div>
      <div class="goal-transfer-summary">
        <div class="panel-heading compact">
          <div>
            <span class="eyebrow">Actual movement</span>
            <h3>Savings impact</h3>
          </div>
          <strong class="${cycleTransferNet >= 0 ? "status-good" : "status-bad"}">${money(
            cycleTransferNet,
            { sign: true },
          )} this cycle</strong>
        </div>
        <p>
          The planned amount above is your target pace. Linked transfers and automatic shares of
          unlinked withdrawals form the actual progress line; neither is treated as an expense.
        </p>
        <div class="goal-transfer-list">
          ${
            recentGoalTransfers.length
              ? recentGoalTransfers
                  .map((transaction) => {
                    const effect = transactionGoalEffect(transaction, goal.id);
                    const automatic = !transaction.goalId;
                    const otherAccount =
                      effect >= 0
                        ? accountById(transaction.accountId)
                        : accountById(transaction.toAccountId);
                    return `<div>
                      <span>${formatCompactDate(transaction.date)} · ${escapeHtml(
                        otherAccount?.name || transaction.description,
                      )}${automatic ? " · Automatic share" : ""}</span>
                      <strong class="${effect >= 0 ? "status-good" : "status-bad"}">${money(effect, {
                        sign: true,
                      })}</strong>
                    </div>`;
                  })
                  .join("")
              : "<p>No savings movement has affected this goal yet.</p>"
          }
        </div>
      </div>
      <div class="goal-chart-wrap" style="--goal-chart-colour:${escapeHtml(
        goal.color || "var(--good)",
      )}">
        <canvas id="goal-chart" height="230" aria-label="Savings goal progress chart"></canvas>
        <div class="goal-chart-key" aria-hidden="true">
          <span><i class="target-line"></i>Steady target</span>
          <span><i class="saved-line"></i>Savings added</span>
          <span><i class="withdrawn-line"></i>Savings withdrawn</span>
        </div>
      </div>
      <div class="dialog-actions" style="position:static;padding:18px 0 0;border:0;background:transparent">
        <button class="primary-button" type="button" data-add-goal-progress="${escapeHtml(
          goal.id,
        )}">Reconcile saved amount</button>
      </div>`;
    requestAnimationFrame(() => drawGoalChart(goal, projection));
  }

  function canvasSetup(canvas, cssHeight) {
    if (!canvas) return null;
    const width = Math.max(300, canvas.clientWidth || 600);
    const height = cssHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  function drawGoalChart(goal, projection) {
    const setup = canvasSetup($("#goal-chart"), 230);
    if (!setup) return;
    const { context, width, height } = setup;
    const padding = { top: 20, right: 18, bottom: 35, left: 18 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const start = parseDate(goal.startDate || localDate());
    const end = parseDate(projection.endDate || addDays(localDate(), payIntervalDays()));
    const progressDate = parseDate(goalProgressDate(goal, projection));
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const progressDays = Math.max(
      0,
      Math.min(totalDays, Math.round((progressDate - start) / 86400000)),
    );
    const starting = Number(goal.startingAmount || 0);
    const target = Math.max(1, projection.target);
    const x = (day) => padding.left + (day / totalDays) * plotWidth;
    const y = (amount) =>
      padding.top + plotHeight - (Math.max(0, Math.min(target, amount)) / target) * plotHeight;

    context.strokeStyle = themeCss("--border");
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding.left, y(0));
    context.lineTo(width - padding.right, y(0));
    context.stroke();

    context.setLineDash([6, 5]);
    context.strokeStyle = themeCss("--accent");
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x(0), y(starting));
    context.lineTo(x(totalDays), y(target));
    context.stroke();
    context.setLineDash([]);

    const positiveColour = goal.color || themeCss("--good");
    const negativeColour = themeCss("--bad");
    const drawActualSegment = (fromDay, fromAmount, toDay, toAmount, colour) => {
      context.strokeStyle = colour;
      context.lineWidth = 4;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x(fromDay), y(fromAmount));
      context.lineTo(x(toDay), y(toAmount));
      context.stroke();
    };
    let runningAmount = starting;
    let previousDay = 0;
    let endpointColour = positiveColour;
    goalTransfers(goal)
      .filter((transaction) => {
        const day = Math.round((parseDate(transaction.date) - start) / 86400000);
        return day >= 0 && day <= progressDays;
      })
      .forEach((transaction) => {
        const day = Math.max(
          0,
          Math.min(progressDays, Math.round((parseDate(transaction.date) - start) / 86400000)),
        );
        const effect = transactionGoalEffect(transaction, goal.id);
        const nextAmount = roundMoney(Math.max(0, runningAmount + effect));
        endpointColour = effect < 0 ? negativeColour : positiveColour;
        drawActualSegment(previousDay, runningAmount, day, nextAmount, endpointColour);
        runningAmount = nextAmount;
        previousDay = day;
      });

    const reconciliationDifference = roundMoney(projection.current - runningAmount);
    if (Math.abs(reconciliationDifference) >= 0.005) {
      endpointColour = reconciliationDifference < 0 ? negativeColour : positiveColour;
    }
    drawActualSegment(
      previousDay,
      runningAmount,
      progressDays,
      projection.current,
      endpointColour,
    );

    context.fillStyle = endpointColour;
    context.beginPath();
    context.arc(x(progressDays), y(projection.current), 5, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = themeCss("--faint");
    context.font = "11px Segoe UI, sans-serif";
    context.textAlign = "left";
    context.fillText(formatCompactDate(goal.startDate || localDate()), padding.left, height - 12);
    context.textAlign = "right";
    context.fillText(formatCompactDate(projection.endDate || localDate()), width - padding.right, height - 12);
    context.textAlign = "left";
    context.fillText(money(target, { cents: false }), padding.left, padding.top - 5);
  }

  function insightPeriods() {
    return state.periods
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((period) => ({ period, summary: summaryForPeriod(period) }));
  }

  function insightGroups() {
    const grouping = $("#insight-grouping").value;
    const periods = insightPeriods();
    if (grouping === "period") {
      return periods.slice(-8).map(({ period, summary }) => ({
        label: formatCompactDate(period.startDate),
        ...summary,
        ...transferStats(periodTransactions(period)),
      }));
    }
    const groups = new Map();
    const ensureMonth = (date) => {
      const monthKey = date.slice(0, 7);
      if (!groups.has(monthKey)) {
        groups.set(monthKey, {
          label: new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(
            parseDate(`${monthKey}-01`),
          ),
          budgetIncome: 0,
          actualIncome: 0,
          budgetExpenses: 0,
          actualExpenses: 0,
          totalCount: 0,
          intoSavings: 0,
          intoCount: 0,
          outOfSavings: 0,
          outCount: 0,
          otherTransfers: 0,
          otherCount: 0,
          netSavings: 0,
        });
      }
      return groups.get(monthKey);
    };

    periods.forEach(({ period, summary }) => {
      let occurrences = period.archiveOccurrences;
      if (!occurrences && period.status === "active") {
        occurrences = {
          income: state.incomeSources.flatMap((item) =>
            scheduleOccurrences(item, period.startDate, period.endDate),
          ),
          expenses: state.expenses.flatMap((item) =>
            scheduleOccurrences(item, period.startDate, period.endDate),
          ),
        };
      }
      if (occurrences) {
        occurrences.income.forEach((entry) => {
          const group = ensureMonth(entry.date);
          group.budgetIncome = roundMoney(group.budgetIncome + Number(entry.amount || 0));
        });
        occurrences.expenses.forEach((entry) => {
          const group = ensureMonth(entry.date);
          group.budgetExpenses = roundMoney(group.budgetExpenses + Number(entry.amount || 0));
        });
      } else {
        const group = ensureMonth(period.startDate);
        group.budgetIncome = roundMoney(group.budgetIncome + summary.budgetIncome);
        group.budgetExpenses = roundMoney(group.budgetExpenses + summary.budgetExpenses);
      }

      periodTransactions(period).forEach((transaction) => {
        const group = ensureMonth(transaction.date);
        const amount = Number(transaction.amount || 0);
        if (transaction.type === "income") group.actualIncome = roundMoney(group.actualIncome + amount);
        if (transaction.type === "expense") {
          group.actualExpenses = roundMoney(group.actualExpenses + amount);
        }
        if (transaction.type === "refund") {
          group.actualExpenses = roundMoney(group.actualExpenses - amount);
        }
        if (transaction.type === "transfer") {
          const direction = transferDirection(transaction);
          group.totalCount += 1;
          if (direction === "savings-in") {
            group.intoSavings = roundMoney(group.intoSavings + amount);
            group.intoCount += 1;
          } else if (direction === "savings-out") {
            group.outOfSavings = roundMoney(group.outOfSavings + amount);
            group.outCount += 1;
          } else {
            group.otherTransfers = roundMoney(group.otherTransfers + amount);
            group.otherCount += 1;
          }
          group.netSavings = roundMoney(group.intoSavings - group.outOfSavings);
        }
      });
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, group]) => group)
      .slice(-8);
  }

  function renderInsights() {
    const groups = insightGroups();
    const latest = groups[groups.length - 1];
    if (!latest) {
      $("#insight-message").innerHTML =
        "<strong>Your first pattern is waiting.</strong><p>Add a plan and a few transactions, then return here.</p>";
    } else {
      const expenseDifference = roundMoney(latest.budgetExpenses - latest.actualExpenses);
      const incomeDifference = roundMoney(latest.actualIncome - latest.budgetIncome);
      let heading = "You are building a useful baseline.";
      let copy = "Keep capturing transactions—the clearest patterns appear over several pay cycles.";
      if (expenseDifference > 5) {
        heading = "You’re spending less than planned—well done.";
        copy = `${money(expenseDifference)} remained in the expense plan for ${latest.label}.`;
      } else if (expenseDifference < -5) {
        heading = "This period ran above the expense plan.";
        copy = `${money(Math.abs(expenseDifference))} went beyond the plan. Next cycle, check whether the plan or the spending needs to change.`;
      } else if (incomeDifference > 5) {
        heading = "Income landed ahead of projection.";
        copy = `${money(incomeDifference)} more arrived than expected for ${latest.label}.`;
      }
      $("#insight-message").innerHTML = `<strong>${escapeHtml(heading)}</strong><p>${escapeHtml(
        copy,
      )}</p>`;
    }

    requestAnimationFrame(() => {
      drawBarChart($("#expense-chart"), groups, "budgetExpenses", "actualExpenses");
      drawBarChart($("#income-chart"), groups, "budgetIncome", "actualIncome");
    });
    renderTransferHistory(groups);
    renderCategoryBreakdown();
  }

  function renderTransferHistory(groups) {
    const activeGroups = groups.filter((group) => group.totalCount > 0);
    $("#transfer-history").innerHTML = activeGroups.length
      ? `<div class="transfer-history-header">
          <span>Period</span><span>Saved</span><span>Withdrawn</span><span>Net</span><span>Withdrawals</span>
        </div>
        ${activeGroups
          .map(
            (group) => `
              <div class="transfer-history-row">
                <strong>${escapeHtml(group.label)}</strong>
                <span data-label="Saved" class="status-good">${money(group.intoSavings)}</span>
                <span data-label="Withdrawn" class="${group.outOfSavings > 0 ? "status-warn" : ""}">${money(
                  group.outOfSavings,
                )}</span>
                <strong data-label="Net" class="${group.netSavings >= 0 ? "status-good" : "status-bad"}">${money(
                  group.netSavings,
                  { sign: true },
                )}</strong>
                <span data-label="Withdrawals">${group.outCount}</span>
              </div>`,
          )
          .join("")}`
      : emptyState(
          "No transfer pattern yet",
          "Record transfers to see savings contributions and withdrawals separately from spending.",
          "↔",
        );
  }

  function drawBarChart(canvas, groups, budgetKey, actualKey) {
    const setup = canvasSetup(canvas, 280);
    if (!setup) return;
    const { context, width, height } = setup;
    const padding = { top: 18, right: 12, bottom: 40, left: 12 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const max = Math.max(
      1,
      ...groups.flatMap((group) => [Number(group[budgetKey]) || 0, Number(group[actualKey]) || 0]),
    );
    const groupWidth = plotWidth / Math.max(1, groups.length);
    const barWidth = Math.min(24, groupWidth * 0.27);
    const y = (value) => padding.top + plotHeight - (Math.max(0, value) / max) * plotHeight;

    context.strokeStyle = themeCss("--border");
    context.lineWidth = 1;
    for (let line = 0; line <= 3; line += 1) {
      const lineY = padding.top + (plotHeight / 3) * line;
      context.beginPath();
      context.moveTo(padding.left, lineY);
      context.lineTo(width - padding.right, lineY);
      context.stroke();
    }

    groups.forEach((group, index) => {
      const center = padding.left + groupWidth * index + groupWidth / 2;
      const budget = Math.max(0, Number(group[budgetKey]) || 0);
      const actual = Math.max(0, Number(group[actualKey]) || 0);
      context.fillStyle = themeCss("--accent");
      context.fillRect(center - barWidth - 2, y(budget), barWidth, padding.top + plotHeight - y(budget));
      context.fillStyle = themeCss("--good");
      context.fillRect(center + 2, y(actual), barWidth, padding.top + plotHeight - y(actual));
      context.fillStyle = themeCss("--faint");
      context.font = "10px Segoe UI, sans-serif";
      context.textAlign = "center";
      context.fillText(group.label, center, height - 15);
    });

    if (!groups.length) {
      context.fillStyle = themeCss("--faint");
      context.font = "13px Segoe UI, sans-serif";
      context.textAlign = "center";
      context.fillText("No period data yet", width / 2, height / 2);
    }
  }

  function renderCategoryBreakdown() {
    renderUncategorisedAlert("#insight-uncategorised-alert");
    const totals = categoryTotalsForPeriod();
    const rows = Array.from(totals.entries())
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map(([, amount]) => amount));
    $("#category-breakdown").innerHTML = rows.length
      ? rows
          .map(([categoryId, amount]) => {
            const category = categoryById(categoryId) || {
              name: "Uncategorised",
              color: themeCss("--faint"),
            };
            return `
              <div class="breakdown-row">
                <span class="breakdown-label">${escapeHtml(category.name)}</span>
                <div class="breakdown-track"><i style="width:${(amount / max) * 100}%;background:${escapeHtml(
                  category.color || "#8eadcf",
                )}"></i></div>
                <strong>${money(amount)}</strong>
              </div>`;
          })
          .join("")
      : emptyState(
          "No category totals yet",
          "Expense and refund transactions will build this view.",
          "⌁",
        );
  }

  function renderArchive() {
    const expandedPeriodIds = new Set(
      $$("#archive-list details[open][data-archive-period-id]").map(
        (details) => details.dataset.archivePeriodId,
      ),
    );
    const archived = state.periods
      .filter((period) => period.status === "archived")
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    $("#archive-list").innerHTML = archived.length
      ? archived.map(archiveCard).join("")
      : emptyState(
          "No archived cycles",
           "When you close a pay cycle, its plan, transactions, balances, and discrepancies will stay here.",
           '<span class="archive-box-icon empty-archive-box" aria-hidden="true"></span>',
         );
    $$("#archive-list details[data-archive-period-id]").forEach((details) => {
      details.open = expandedPeriodIds.has(details.dataset.archivePeriodId);
    });
  }

  function archiveCard(period) {
    const summary = summaryForPeriod(period);
    const transactions = periodTransactions(period)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const discrepancies = state.adjustments.filter(
      (adjustment) => adjustment.periodId === period.id && adjustment.resolved !== true,
    );
    return `
      <details class="archive-card" data-archive-period-id="${escapeHtml(period.id)}">
        <summary class="archive-summary">
          <div>
            <span>Pay cycle</span>
            <strong>${formatDate(period.startDate)} – ${formatDate(period.endDate)}</strong>
          </div>
          <div><span>Income</span><strong>${money(summary.actualIncome)}</strong></div>
          <div><span>Expenses</span><strong>${money(summary.actualExpenses)}</strong></div>
          <div><span>Net</span><strong class="${
            summary.actualNet >= 0 ? "status-good" : "status-bad"
          }">${money(summary.actualNet)}</strong></div>
          <span class="pill">${transactions.length} entries</span>
        </summary>
        <div class="archive-details">
          <div class="archive-edit-guidance">
            <div>
              <strong>Late corrections are supported</strong>
              <span>Edit a transaction to refresh this cycle's cached totals and carry its account balance change forward. It will not count as current-cycle spending.</span>
            </div>
            ${
              period.archiveEditedAt
                ? `<span class="pill">Corrected ${formatCompactDate(
                    localDate(new Date(period.archiveEditedAt)),
                  )}</span>`
                : ""
            }
          </div>
          ${
            discrepancies.length
              ? `<div class="callout warning">${discrepancies.length} unresolved balance difference${
                  discrepancies.length === 1 ? "" : "s"
                } totalling ${money(
                  discrepancies.reduce((sum, item) => sum + Math.abs(Number(item.delta) || 0), 0),
                )}.</div>`
              : ""
          }
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Type</th><th class="numeric">Amount</th><th><span class="sr-only">Actions</span></th></tr></thead>
              <tbody>
                ${
                  transactions.length
                    ? transactions
                        .map((transaction) => {
                          const account = accountById(transaction.accountId);
                          const destination = accountById(transaction.toAccountId);
                          const presentation = transactionPresentation(transaction);
                          return `<tr>
                            <td>${formatCompactDate(transaction.date)}</td>
                            <td>${escapeHtml(transaction.description)}</td>
                            <td>${escapeHtml(
                              transaction.type === "transfer"
                                ? `${account?.name || "Unknown"} → ${destination?.name || "Unknown"}`
                                : account?.name || "Unknown",
                            )}</td>
                            <td>${escapeHtml(presentation.label)}</td>
                            <td class="numeric ${
                              transferDirection(transaction) === "savings-in"
                                ? "status-good"
                                : transferDirection(transaction) === "savings-out"
                                  ? "status-warn"
                                  : ""
                             }">${escapeHtml(presentation.prefix)}${money(transaction.amount)}</td>
                            <td class="row-actions">
                              <button type="button" data-edit-transaction="${escapeHtml(
                                transaction.id,
                              )}" aria-label="Edit archived transaction ${escapeHtml(
                                transaction.description,
                              )}">Edit</button>
                            </td>
                          </tr>`;
                        })
                        .join("")
                    : '<tr><td colspan="6">No transactions in this cycle.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </div>
      </details>`;
  }

  function renderSettings() {
    const form = $("#settings-form");
    const period = activePeriod();
    form.elements.currency.value = state.settings.currency;
    form.elements.payIntervalValue.value = state.settings.payIntervalValue;
    form.elements.payIntervalUnit.value = state.settings.payIntervalUnit;
    form.elements.periodStart.value = period.startDate;
    form.elements.primaryIncomeId.innerHTML = optionList(
      state.incomeSources,
      state.settings.primaryIncomeId,
      "No primary income",
    );
    const overdue = backupIsOverdue();
    const backupPill = $("#backup-status-pill");
    const hasExternalBackup = Number.isFinite(lastExternalBackupTime());
    backupPill.textContent = overdue
      ? "Backup due"
      : hasExternalBackup
        ? "Backup protected"
        : "First backup due soon";
    backupPill.className = `pill ${overdue ? "bad" : hasExternalBackup ? "good" : ""}`;
    const dateTime = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const lastBackup = lastExternalBackupTime();
    const dueAt = backupDueAt();
    $("#data-health").innerHTML = `
      <strong>Browser working copy + external JSON backup</strong><br>
      Last browser save: ${
        state.metadata.lastSavedAt
          ? dateTime.format(new Date(state.metadata.lastSavedAt))
          : "not yet"
      }.<br>
      Last external backup: ${
        Number.isFinite(lastBackup) ? dateTime.format(new Date(lastBackup)) : "not recorded"
      }.<br>
      ${overdue ? "Backup required now" : `Next backup due: ${dateTime.format(new Date(dueAt))}`}.<br>
      Suggested filename: <code>${escapeHtml(backupFilename())}</code>.<br>
      Canopy v${APP_VERSION} · JSON schema v${state.schemaVersion}.`;
    renderUpdateStatus();
  }

  function renderUpdateStatus() {
    const pill = $("#update-status-pill");
    if (!pill) return;
    const enabled = state.settings.checkForUpdates !== false;
    const latest = normaliseVersion(state.metadata.latestKnownVersion);
    const hasUpdate = latest && compareVersions(latest, APP_VERSION) > 0;
    const lastCheck = Date.parse(state.metadata.lastUpdateCheckAt || "");
    const checkbox = $("#automatic-update-checks");
    const button = $("#check-for-updates");
    checkbox.checked = enabled;
    button.disabled = updateCheckInFlight;
    button.textContent = updateCheckInFlight ? "Checking…" : "Check now";

    let label = "Not checked";
    let tone = "";
    if (!enabled) label = "Checks off";
    else if (updateCheckInFlight) label = "Checking…";
    else if (hasUpdate) {
      label = `v${latest} available`;
      tone = "warn";
    } else if (updateCheckResult === "offline") label = "Offline";
    else if (updateCheckResult === "error") label = "Check unavailable";
    else if (Number.isFinite(lastCheck)) {
      label = "Up to date";
      tone = "good";
    }
    pill.textContent = label;
    pill.className = `pill ${tone}`;

    const checkedText = Number.isFinite(lastCheck)
      ? `Last successful check: ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(lastCheck))}.`
      : "No successful GitHub check has been recorded yet.";
    $("#update-status-detail").innerHTML = `
      <strong>Installed version: ${APP_VERSION}</strong><br>
      ${escapeHtml(checkedText)}<br>
      ${enabled ? "Automatic checks run at most once per day." : "Automatic network checks are disabled."}`;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function openTransactionDialog(transactionId = null) {
    if (!state.accounts.length) {
      toast("Add an account before recording a transaction.", "error");
      switchView("plan");
      currentPlanTab = "accounts";
      renderPlan();
      return;
    }
    const dialog = $("#transaction-dialog");
    const form = $("#transaction-form");
    const transaction = transactionId
      ? state.transactions.find((item) => item.id === transactionId)
      : null;
    const transactionPeriod = transaction ? periodById(transaction.periodId) : activePeriod();
    const isArchivedEdit = transactionPeriod?.status === "archived";
    form.reset();
    form.dataset.archivedEdit = String(isArchivedEdit);
    form.elements.id.value = transaction?.id || "";
    form.elements.date.value = transaction?.date || localDate();
    form.elements.type.value = transaction?.type || "expense";
    form.elements.description.value = transaction?.description || "";
    form.elements.amount.value = transaction?.amount ?? "";
    form.elements.reference.value = transaction?.reference || "";
    form.elements.note.value = transaction?.note || "";
    renderTransactionPlanOptions(transaction?.linkedPlanId || "");
    form.elements.accountId.value = transaction?.accountId || state.accounts[0]?.id || "";
    form.elements.toAccountId.value = transaction?.toAccountId || "";
    form.elements.goalId.value = transaction?.goalId || "";
    form.elements.categoryId.value = transaction?.categoryId || "";
    form.elements.isSplit.checked = Boolean(transaction?.splits?.length);
    form.elements.date.min = isArchivedEdit ? transactionPeriod.startDate : "";
    form.elements.date.max = isArchivedEdit ? transactionPeriod.endDate : "";
    $("#transaction-dialog-title").textContent = isArchivedEdit
      ? "Edit archived transaction"
      : transaction
        ? "Edit transaction"
        : "Add transaction";
    const archiveNotice = $("#transaction-archive-notice");
    archiveNotice.hidden = !isArchivedEdit;
    archiveNotice.innerHTML = isArchivedEdit
      ? `<strong>${formatDate(transactionPeriod.startDate)} – ${formatDate(
          transactionPeriod.endDate,
        )}</strong><span>Saving recalculates this archived cycle and carries the account difference forward to current balances. Current-cycle income and spending remain separate. For split transactions, changing a line updates the total automatically.</span>`
      : "";
    $("#save-transaction").textContent = isArchivedEdit
      ? "Save archive correction"
      : "Save transaction";
    $("#delete-transaction").hidden = !transaction;
    syncTransactionTypeFields();
    renderSplitLines(transaction?.splits || []);
    showDialog(dialog);
    dialog.scrollTop = 0;
    setTimeout(() => {
      if (isArchivedEdit) dialog.scrollTop = 0;
      else form.elements.description.focus();
    }, 20);
  }

  function syncTransactionTypeFields() {
    const form = $("#transaction-form");
    const type = form.elements.type.value;
    const isTransfer = type === "transfer";
    $$(".transfer-only", form).forEach((element) => (element.hidden = !isTransfer));
    $$(".non-transfer", form).forEach((element) => (element.hidden = isTransfer));
    form.elements.toAccountId.required = isTransfer;
    form.elements.isSplit.disabled = isTransfer || type === "income";
    $("#transaction-account-label").textContent = isTransfer ? "From account" : "Account";
    if (form.elements.isSplit.disabled) form.elements.isSplit.checked = false;
    if (!isTransfer) {
      form.elements.toAccountId.value = "";
      form.elements.goalId.value = "";
    }
    $("#split-editor").hidden = !form.elements.isSplit.checked;
    renderTransactionPlanOptions(form.elements.linkedPlanId.value);
    $("#transaction-suggestion").textContent = isTransfer
      ? "Transfers affect both account balances but not income or expenses."
      : "";
  }

  function applyPlanSuggestion(form, description, type, suggestionTarget) {
    if (type === "transfer") {
      suggestionTarget.textContent = "";
      return;
    }
    const planType = type === "income" ? "income" : "expense";
    const match = matchingPlan(description, planType);
    if (!match) {
      suggestionTarget.textContent = "";
      return;
    }
    if (match.accountId) form.elements.accountId.value = match.accountId;
    if (match.categoryId && form.elements.categoryId) form.elements.categoryId.value = match.categoryId;
    if (form.elements.linkedPlanId) form.elements.linkedPlanId.value = match.id;
    suggestionTarget.textContent = `Matched “${match.name}” · account and category suggested.`;
  }

  function applySelectedGoalAccount(form) {
    const goal = goalById(form.elements.goalId.value);
    if (!goal?.accountId) return;
    if (form.elements.accountId.value !== goal.accountId) {
      form.elements.toAccountId.value = goal.accountId;
    }
  }

  function splitLineTemplate(split = {}) {
    return `
      <div class="split-line">
        <label>
          <span>Category</span>
          <select data-split-category>${categoryOptions(split.categoryId || "", "expense")}</select>
        </label>
        <label>
          <span>Planned expense</span>
          <select data-split-plan>${optionList(
            state.expenses,
            split.linkedPlanId || "",
            "No planned item",
          )}</select>
        </label>
        <label>
          <span>Amount</span>
          <input data-split-amount type="number" min="0" step="0.01" value="${
            split.amount ?? ""
          }" placeholder="0.00" />
        </label>
        <button class="icon-button" type="button" data-remove-split aria-label="Remove split line">×</button>
      </div>`;
  }

  function renderSplitLines(splits = []) {
    const form = $("#transaction-form");
    const enabled = form.elements.isSplit.checked && !form.elements.isSplit.disabled;
    $("#split-editor").hidden = !enabled;
    if (!enabled) {
      $("#split-lines").innerHTML = "";
      return;
    }
    const lines = splits.length
      ? splits
      : [
          { amount: form.elements.amount.value || "" },
          { amount: "" },
        ];
    $("#split-lines").innerHTML = lines.map(splitLineTemplate).join("");
    updateSplitTotal();
  }

  function collectSplits() {
    return $$(".split-line", $("#split-lines"))
      .map((line) => ({
        id: uid("split"),
        categoryId: $("[data-split-category]", line).value,
        linkedPlanId: $("[data-split-plan]", line).value,
        amount: roundMoney($("[data-split-amount]", line).value),
      }))
      .filter((split) => split.amount > 0);
  }

  function updateSplitTotal() {
    const form = $("#transaction-form");
    const total = collectSplits().reduce((sum, split) => sum + split.amount, 0);
    const expected = Number(form.elements.amount.value) || 0;
    const element = $("#split-total");
    element.textContent = `Split total ${money(total)} · transaction ${money(expected)}`;
    element.classList.toggle("is-invalid", Math.abs(total - expected) >= 0.005);
  }

  function syncArchivedAmountToSplitTotal() {
    const form = $("#transaction-form");
    if (form.dataset.archivedEdit !== "true" || !form.elements.isSplit.checked) return;
    const total = collectSplits().reduce((sum, split) => sum + split.amount, 0);
    if (total > 0) form.elements.amount.value = roundMoney(total).toFixed(2);
  }

  function submitTransaction(form) {
    const data = new FormData(form);
    const id = String(data.get("id") || "");
    const type = String(data.get("type"));
    const amount = roundMoney(data.get("amount"));
    const existing = state.transactions.find((item) => item.id === id);
    if (amount <= 0) {
      toast("Enter an amount greater than zero.", "error");
      return false;
    }
    if (
      type === "transfer" &&
      data.get("accountId") &&
      data.get("accountId") === data.get("toAccountId")
    ) {
      toast("A transfer needs two different accounts.", "error");
      return false;
    }

    const useSplits = data.get("isSplit") === "on" && ["expense", "refund"].includes(type);
    const splits = useSplits ? collectSplits() : [];
    if (
      useSplits &&
      (splits.length < 2 || Math.abs(splits.reduce((sum, split) => sum + split.amount, 0) - amount) >= 0.005)
    ) {
      toast("Split lines must add up exactly to the transaction amount.", "error");
      return false;
    }

    const transaction = {
      id: id || uid("txn"),
      periodId: existing?.periodId || activePeriod().id,
      date: String(data.get("date")),
      type,
      description: String(data.get("description") || "").trim(),
      amount,
      accountId: String(data.get("accountId") || ""),
      toAccountId: type === "transfer" ? String(data.get("toAccountId") || "") : "",
      goalId: type === "transfer" ? String(data.get("goalId") || "") : "",
      categoryId: type === "transfer" ? "" : String(data.get("categoryId") || ""),
      linkedPlanId: type === "transfer" ? "" : String(data.get("linkedPlanId") || ""),
      reference: String(data.get("reference") || "").trim(),
      note: String(data.get("note") || "").trim(),
      splits,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (type === "transfer" && (!transaction.accountId || !transaction.toAccountId)) {
      toast("Choose both the source and destination accounts.", "error");
      return false;
    }
    const goalTransferError = validateGoalTransfer(transaction);
    if (goalTransferError) {
      toast(goalTransferError, "error");
      return false;
    }
    transaction.transferNature = type === "transfer" ? inferTransferDirection(transaction) : "";
    const previousTransaction = existing ? clone(existing) : null;
    transaction.goalContribution =
      type === "transfer" && transaction.goalId
        ? roundMoney(inferGoalTransferEffect(transaction))
        : 0;
    transaction.goalImpacts = automaticGoalImpacts(transaction, previousTransaction);

    mutate(
      transactionMutationMessage(
        existing && periodById(existing.periodId)?.status === "archived"
          ? "Archived transaction updated. Later account balances were refreshed."
          : existing
            ? "Transaction updated."
            : "Transaction added.",
        transaction,
      ),
      () => {
        if (existing) Object.assign(existing, transaction);
        else state.transactions.push(transaction);
        applyGoalTransferChange(previousTransaction, transaction);
        if (existing) {
          refreshArchivedPeriodAfterTransactionChange(previousTransaction, transaction);
        }
      },
    );
    return true;
  }

  function submitQuickTransaction(form) {
    const data = new FormData(form);
    const type = String(data.get("type"));
    const transaction = {
      id: uid("txn"),
      periodId: activePeriod().id,
      date: String(data.get("date")),
      type,
      description: String(data.get("description") || "").trim(),
      amount: roundMoney(data.get("amount")),
      accountId: String(data.get("accountId") || ""),
      toAccountId: type === "transfer" ? String(data.get("toAccountId") || "") : "",
      goalId: type === "transfer" ? String(data.get("goalId") || "") : "",
      categoryId: type === "transfer" ? "" : String(data.get("categoryId") || ""),
      linkedPlanId:
        type === "transfer"
          ? ""
          : matchingPlan(data.get("description"), type === "income" ? "income" : "expense")?.id || "",
      reference: "",
      note: "",
      splits: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (transaction.amount <= 0 || !transaction.description || !transaction.accountId) {
      toast("Description, amount, and account are required.", "error");
      return;
    }
    if (
      type === "transfer" &&
      (!transaction.toAccountId || transaction.accountId === transaction.toAccountId)
    ) {
      toast("Choose two different accounts for the transfer.", "error");
      return;
    }
    const goalTransferError = validateGoalTransfer(transaction);
    if (goalTransferError) {
      toast(goalTransferError, "error");
      return;
    }
    transaction.transferNature = type === "transfer" ? inferTransferDirection(transaction) : "";
    transaction.goalContribution =
      type === "transfer" && transaction.goalId
        ? roundMoney(inferGoalTransferEffect(transaction))
        : 0;
    transaction.goalImpacts = automaticGoalImpacts(transaction);
    const date = transaction.date;
    const accountId = transaction.accountId;
    mutate(transactionMutationMessage("Transaction added.", transaction), () => {
      state.transactions.push(transaction);
      applyGoalTransferChange(null, transaction);
    });
    form.reset();
    form.elements.date.value = date;
    form.elements.type.value = "expense";
    syncQuickTransactionTypeFields();
    form.elements.accountId.value = accountId;
    $("#quick-suggestion").textContent = "";
    form.elements.description.focus();
  }

  function recurrenceFields(item = {}, allowIrregular = false) {
    const schedule = itemSchedule(item);
    const expectedDates = schedule.expectedDates
      .map((entry) => `${entry.date}${entry.amount != null ? `, ${entry.amount}` : ""}`)
      .join("\n");
    return `
      ${
        allowIrregular
          ? `<label>
              <span>Schedule style</span>
              <select name="scheduleMode">
                <option value="recurring" ${schedule.mode === "recurring" ? "selected" : ""}>Recurring interval</option>
                <option value="irregular" ${schedule.mode === "irregular" ? "selected" : ""}>Irregular expected dates</option>
              </select>
            </label>`
          : '<input name="scheduleMode" type="hidden" value="recurring">'
      }
      <label class="recurring-field">
        <span>First / next date</span>
        <input name="anchorDate" type="date" value="${escapeHtml(schedule.anchorDate)}" required />
      </label>
      <label class="recurring-field">
        <span>Repeat every</span>
        <div class="field-pair">
          <input name="interval" type="number" min="1" max="999" value="${schedule.interval}" required />
          <select name="unit">
            ${["days", "weeks", "months", "years"]
              .map(
                (unit) =>
                  `<option value="${unit}" ${schedule.unit === unit ? "selected" : ""}>${unit}</option>`,
              )
              .join("")}
          </select>
        </div>
      </label>
      ${
        allowIrregular
          ? `<label class="full-width irregular-field">
              <span>Expected dates (one per line)</span>
              <textarea name="expectedDates" rows="5" placeholder="2026-08-01, 850.00&#10;2026-09-12, 620.00">${escapeHtml(
                expectedDates,
              )}</textarea>
              <small>Use YYYY-MM-DD, amount. If amount is omitted, the default amount above is used.</small>
            </label>`
          : ""
      }`;
  }

  function entityFields(type, item = null) {
    if (type === "expense") {
      return `
        <div class="form-grid">
          <label class="full-width"><span>Name</span><input name="name" type="text" value="${escapeHtml(
            item?.name || "",
          )}" placeholder="e.g. City Gym" required /></label>
          <label><span>Amount each time</span><input name="amount" type="number" min="0" step="0.01" value="${
            item?.amount ?? ""
          }" required /></label>
          <label><span>Default account</span><select name="accountId">${optionList(
            state.accounts,
            item?.accountId || "",
            "Choose account",
          )}</select></label>
          <label><span>Category</span><select name="categoryId">${categoryOptions(
            item?.categoryId || "",
            "expense",
          )}</select></label>
          <label><span>Keywords</span><input name="keywords" type="text" value="${escapeHtml(
            (item?.keywords || []).join(", "),
          )}" placeholder="gym, membership" /></label>
          <label class="checkbox-label checkbox-explainer full-width">
            <input name="isEstimate" type="checkbox" ${item?.isEstimate === true ? "checked" : ""} />
            <span>
              <strong>Flexible spending estimate</strong>
              <small>Use for parking, groceries, and similar targets. Spending less is positive, and an unused occurrence is not overdue.</small>
            </span>
          </label>
          ${recurrenceFields(item || {})}
          <label class="checkbox-label full-width"><input name="active" type="checkbox" ${
            item?.active === false ? "" : "checked"
          } /><span>Include this expense in future cycles</span></label>
        </div>`;
    }
    if (type === "income") {
      return `
        <div class="form-grid">
          <label class="full-width"><span>Name</span><input name="name" type="text" value="${escapeHtml(
            item?.name || "",
          )}" placeholder="e.g. Main job" required /></label>
          <label><span>Default amount</span><input name="amount" type="number" min="0" step="0.01" value="${
            item?.amount ?? ""
          }" required /></label>
          <label><span>Deposit account</span><select name="accountId">${optionList(
            state.accounts,
            item?.accountId || "",
            "Choose account",
          )}</select></label>
          <label><span>Category</span><select name="categoryId">${categoryOptions(
            item?.categoryId || "cat_income",
            "income",
          )}</select></label>
          <label><span>Keywords</span><input name="keywords" type="text" value="${escapeHtml(
            (item?.keywords || []).join(", "),
          )}" placeholder="employer, payroll" /></label>
          ${recurrenceFields(item || {}, true)}
          <label class="checkbox-label full-width"><input name="primary" type="checkbox" ${
            item?.id === state.settings.primaryIncomeId ? "checked" : ""
          } /><span>Use as my primary income source</span></label>
          <label class="checkbox-label full-width"><input name="active" type="checkbox" ${
            item?.active === false ? "" : "checked"
          } /><span>Include this income in future cycles</span></label>
        </div>`;
    }
    if (type === "account") {
      const balance = item ? accountBalance(item.id) : 0;
      return `
        <div class="form-grid">
          <label class="full-width"><span>Name</span><input name="name" type="text" value="${escapeHtml(
            item?.name || "",
          )}" placeholder="e.g. Bills" required /></label>
          <label><span>Account type</span><select name="kind">
            ${["transaction", "savings", "cash", "credit", "loan", "other"]
              .map(
                (kind) =>
                  `<option value="${kind}" ${item?.kind === kind ? "selected" : ""}>${kind[0].toUpperCase() + kind.slice(1)}</option>`,
              )
              .join("")}
          </select></label>
          <label><span>Colour</span><input name="color" type="color" value="${escapeHtml(
            item?.color || COLOURS[state.accounts.length % COLOURS.length],
          )}" /></label>
          ${
            item
              ? `<div class="callout full-width">Current calculated balance: ${money(
                  balance,
                )}. Use “Adjust balance” on the account card to record an unexplained difference.</div>`
              : `<label class="full-width"><span>Opening balance</span><input name="openingBalance" type="number" step="0.01" value="0" required /></label>`
          }
        </div>`;
    }
    if (type === "category") {
      return `
        <div class="form-grid">
          <label class="full-width"><span>Name</span><input name="name" type="text" value="${escapeHtml(
            item?.name || "",
          )}" required /></label>
          <label><span>Used for</span><select name="type">
            ${["expense", "income", "both"]
              .map(
                (categoryType) =>
                  `<option value="${categoryType}" ${item?.type === categoryType ? "selected" : ""}>${categoryType[0].toUpperCase() + categoryType.slice(1)}</option>`,
              )
              .join("")}
          </select></label>
          <label><span>Colour</span><input name="color" type="color" value="${escapeHtml(
            item?.color || COLOURS[state.categories.length % COLOURS.length],
          )}" /></label>
        </div>`;
    }
    if (type === "goal") {
      return `
        <div class="form-grid">
          <label class="full-width"><span>Goal name</span><input name="name" type="text" value="${escapeHtml(
            item?.name || "",
          )}" placeholder="e.g. Emergency fund" required /></label>
          <label><span>Target amount</span><input name="targetAmount" type="number" min="0" step="0.01" value="${
            item?.targetAmount ?? ""
          }" required /></label>
          <label><span>Saved so far</span><input name="currentAmount" type="number" min="0" step="0.01" value="${
            item?.currentAmount ?? 0
          }" required /></label>
          <label><span>Start date</span><input name="startDate" type="date" value="${escapeHtml(
            item?.startDate || localDate(),
          )}" required /></label>
          <label><span>Associated account</span><select name="accountId">${optionList(
            state.accounts,
            item?.accountId || "",
            "No account",
          )}</select></label>
          <label><span>Plan by</span><select name="mode">
            <option value="date" ${item?.mode !== "contribution" ? "selected" : ""}>Finish date</option>
            <option value="contribution" ${item?.mode === "contribution" ? "selected" : ""}>Amount per pay cycle</option>
          </select></label>
          <label class="goal-date-field"><span>Finish date</span><input name="endDate" type="date" value="${escapeHtml(
            item?.endDate || addYears(localDate(), 1),
          )}" /></label>
          <label class="goal-contribution-field"><span>Amount per pay cycle</span><input name="contributionPerPeriod" type="number" min="0" step="0.01" value="${
            item?.contributionPerPeriod ?? ""
          }" /></label>
          <label><span>Colour</span><input name="color" type="color" value="${escapeHtml(
            item?.color || "#75c7a0",
          )}" /></label>
        </div>`;
    }
    return "";
  }

  function entityCollection(type) {
    if (type === "expense") return state.expenses;
    if (type === "income") return state.incomeSources;
    if (type === "account") return state.accounts;
    if (type === "category") return state.categories;
    if (type === "goal") return state.goals;
    return [];
  }

  function openEntityDialog(type, id = null) {
    const collection = entityCollection(type);
    const item = id ? collection.find((entry) => entry.id === id) : null;
    const labels = {
      expense: ["Scheduled outflow", "recurring expense"],
      income: ["Expected earnings", "income source"],
      account: ["Money container", "account"],
      category: ["Tracking label", "category"],
      goal: ["Future plan", "savings goal"],
    };
    const [eyebrow, noun] = labels[type];
    const form = $("#entity-form");
    form.elements.entityType.value = type;
    form.elements.id.value = item?.id || "";
    $("#entity-eyebrow").textContent = eyebrow;
    $("#entity-dialog-title").textContent = `${item ? "Edit" : "Add"} ${noun}`;
    $("#entity-form-fields").innerHTML = entityFields(type, item);
    $("#delete-entity").hidden = !item;
    syncEntityConditionalFields();
    showDialog($("#entity-dialog"));
    setTimeout(() => $("#entity-form-fields input:not([type='hidden'])")?.focus(), 20);
  }

  function syncEntityConditionalFields() {
    const form = $("#entity-form");
    const type = form.elements.entityType.value;
    if (type === "income") {
      const irregular = form.elements.scheduleMode?.value === "irregular";
      $$(".recurring-field", form).forEach((field) => (field.hidden = irregular));
      $$(".irregular-field", form).forEach((field) => (field.hidden = !irregular));
      if (form.elements.anchorDate) form.elements.anchorDate.required = !irregular;
    }
    if (type === "goal") {
      const contribution = form.elements.mode?.value === "contribution";
      $$(".goal-date-field", form).forEach((field) => (field.hidden = contribution));
      $$(".goal-contribution-field", form).forEach((field) => (field.hidden = !contribution));
      if (form.elements.endDate) form.elements.endDate.required = !contribution;
      if (form.elements.contributionPerPeriod) {
        form.elements.contributionPerPeriod.required = contribution;
      }
    }
  }

  function parseExpectedDates(text, defaultAmount) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [date, amount] = line.split(",").map((part) => part.trim());
        return {
          date,
          amount: amount === undefined || amount === "" ? Number(defaultAmount) : roundMoney(amount),
        };
      })
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(entry.amount));
  }

  function submitEntity(form) {
    const data = new FormData(form);
    const type = String(data.get("entityType"));
    const id = String(data.get("id") || "");
    const collection = entityCollection(type);
    const existing = id ? collection.find((entry) => entry.id === id) : null;
    const name = String(data.get("name") || "").trim();
    if (!name) {
      toast("A name is required.", "error");
      return false;
    }
    if (type === "category" && name.toLocaleLowerCase() === "uncategorised") {
      toast("Uncategorised is built in and does not need to be created.", "error");
      return false;
    }

    if (type === "expense" || type === "income") {
      const amount = roundMoney(data.get("amount"));
      const mode = type === "income" ? String(data.get("scheduleMode") || "recurring") : "recurring";
      const schedule = {
        mode,
        anchorDate: String(data.get("anchorDate") || localDate()),
        interval: Math.max(1, Number(data.get("interval")) || 1),
        unit: String(data.get("unit") || "months"),
        expectedDates:
          mode === "irregular" ? parseExpectedDates(data.get("expectedDates"), amount) : [],
      };
      const item = {
        id: existing?.id || uid(type),
        name,
        amount,
        accountId: String(data.get("accountId") || ""),
        categoryId: String(data.get("categoryId") || ""),
        keywords: String(data.get("keywords") || "")
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        schedule,
        isEstimate: type === "expense" && data.get("isEstimate") === "on",
        active: data.get("active") === "on",
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mutate(`${type === "income" ? "Income source" : "Expense"} saved.`, () => {
        if (existing) Object.assign(existing, item);
        else collection.push(item);
        if (type === "income" && data.get("primary") === "on") {
          state.settings.primaryIncomeId = item.id;
        } else if (
          type === "income" &&
          existing?.id === state.settings.primaryIncomeId &&
          data.get("primary") !== "on"
        ) {
          state.settings.primaryIncomeId = "";
        }
      });
      return true;
    }

    if (type === "account") {
      const account = {
        id: existing?.id || uid("acct"),
        name,
        kind: String(data.get("kind") || "transaction"),
        color: String(data.get("color") || "#8eadcf"),
      };
      mutate("Account saved.", () => {
        if (existing) Object.assign(existing, account);
        else {
          state.accounts.push(account);
          activePeriod().openingBalances[account.id] = roundMoney(data.get("openingBalance"));
        }
      });
      return true;
    }

    if (type === "category") {
      const category = {
        id: existing?.id || uid("cat"),
        name,
        type: String(data.get("type") || "expense"),
        color: String(data.get("color") || "#8eadcf"),
      };
      mutate("Category saved.", () => {
        if (existing) Object.assign(existing, category);
        else state.categories.push(category);
      });
      return true;
    }

    if (type === "goal") {
      const startingAmount = existing
        ? Number(existing.startingAmount || existing.currentAmount || 0)
        : roundMoney(data.get("currentAmount"));
      const goal = {
        id: existing?.id || uid("goal"),
        name,
        targetAmount: roundMoney(data.get("targetAmount")),
        currentAmount: roundMoney(data.get("currentAmount")),
        startingAmount,
        startDate: String(data.get("startDate") || localDate()),
        accountId: String(data.get("accountId") || ""),
        mode: String(data.get("mode") || "date"),
        endDate: String(data.get("endDate") || ""),
        contributionPerPeriod: roundMoney(data.get("contributionPerPeriod")),
        color: String(data.get("color") || "#75c7a0"),
        updatedAt: new Date().toISOString(),
      };
      mutate("Savings goal saved.", () => {
        if (existing) Object.assign(existing, goal);
        else state.goals.push(goal);
        selectedGoalId = goal.id;
      });
      return true;
    }
    return false;
  }

  function deleteEntity() {
    const form = $("#entity-form");
    const type = form.elements.entityType.value;
    const id = form.elements.id.value;
    const collection = entityCollection(type);
    const item = collection.find((entry) => entry.id === id);
    if (!item) return;

    if (type === "account") {
      const referenced =
        state.transactions.some(
          (transaction) => transaction.accountId === id || transaction.toAccountId === id,
        ) ||
        state.expenses.some((expense) => expense.accountId === id) ||
        state.incomeSources.some((income) => income.accountId === id) ||
        state.goals.some((goal) => goal.accountId === id);
      if (referenced) {
        toast("This account is still used by transactions or planned items.", "error");
        return;
      }
    }
    if (type === "category" && id === UNCATEGORISED_CATEGORY_ID) {
      toast("Uncategorised is the fallback for records whose category is removed.", "error");
      return;
    }
    const categoryWarning =
      type === "category" ? " Existing records will be moved to Uncategorised." : "";
    if (!window.confirm(`Delete “${item.name}”?${categoryWarning} This cannot be undone.`)) return;

    mutate(`${item.name} deleted.`, () => {
      const index = collection.findIndex((entry) => entry.id === id);
      collection.splice(index, 1);
      if (type === "expense") {
        state.transactions.forEach((transaction) => {
          if (transaction.linkedPlanId === id) transaction.linkedPlanId = "";
          transaction.splits?.forEach((split) => {
            if (split.linkedPlanId === id) split.linkedPlanId = "";
          });
        });
      }
      if (type === "income") {
        state.transactions.forEach((transaction) => {
          if (transaction.linkedPlanId === id) transaction.linkedPlanId = "";
        });
        if (state.settings.primaryIncomeId === id) state.settings.primaryIncomeId = "";
      }
      if (type === "category") {
        reassignCategoryReferences(id);
      }
      if (type === "goal") {
        state.transactions.forEach((transaction) => {
          if (transaction.goalId === id) {
            transaction.goalId = "";
            transaction.goalContribution = 0;
          }
          transaction.goalImpacts = normaliseGoalImpacts(transaction.goalImpacts).filter(
            (impact) => impact.goalId !== id,
          );
        });
        if (selectedGoalId === id) selectedGoalId = null;
      }
    });
    closeDialog($("#entity-dialog"));
  }

  function setAdjustmentMessage(message = "") {
    const element = $("#adjustment-message");
    const input = $("#adjustment-form").elements.reportedBalance;
    element.textContent = message;
    element.hidden = !message;
    input.setAttribute("aria-invalid", String(Boolean(message)));
  }

  function openAdjustmentDialog(accountId) {
    const account = accountById(accountId);
    if (!account) return;
    const balance = accountBalance(accountId);
    const form = $("#adjustment-form");
    form.reset();
    $$(".toast", $("#toast-region")).forEach((item) => item.remove());
    setAdjustmentMessage();
    form.elements.accountId.value = accountId;
    form.elements.reportedBalance.value = balance.toFixed(2);
    form.elements.date.value = localDate();
    $("#adjustment-copy").textContent = `${account.name} currently calculates to ${money(
      balance,
    )}. Enter the balance shown by the bank or account.`;
    showDialog($("#adjustment-dialog"));
    setTimeout(() => form.elements.reportedBalance.select(), 20);
  }

  function resolveAccountAdjustments(accountId) {
    const account = accountById(accountId);
    const pending = state.adjustments.filter(
      (adjustment) =>
        adjustment.periodId === activePeriod().id &&
        adjustment.accountId === accountId &&
        adjustment.resolved !== true,
    );
    if (!account || !pending.length) return;
    const currentBalance = accountBalance(accountId);
    const pendingDelta = pending.reduce(
      (sum, adjustment) => sum + Number(adjustment.delta || 0),
      0,
    );
    const balanceAfterResolve = roundMoney(currentBalance - pendingDelta);
    if (
      !window.confirm(
        `Resolve the unexplained difference for ${account.name}? Its calculated balance will change from ${money(
          currentBalance,
        )} to ${money(
          balanceAfterResolve,
        )}. Only continue after recording the missing transaction(s); the temporary correction will be removed.`,
      )
    ) {
      return;
    }
    mutate(`${account.name} difference resolved. Balance is now ${money(balanceAfterResolve)}.`, () => {
      pending.forEach((adjustment) => {
        adjustment.resolved = true;
        adjustment.resolvedAt = new Date().toISOString();
      });
    });
  }

  function submitAdjustment(form) {
    const data = new FormData(form);
    const result = recordBalanceDifference({
      accountId: data.get("accountId"),
      reportedBalance: data.get("reportedBalance"),
      date: data.get("date"),
      note: data.get("note"),
    });
    if (result.status === "invalid") {
      setAdjustmentMessage("Enter a valid reported balance.");
      form.elements.reportedBalance.focus();
      return false;
    }
    if (result.status === "matches") {
      setAdjustmentMessage(
        `This account already calculates to ${money(
          result.expected,
        )}. Enter the balance shown by the bank only if it is different.`,
      );
      form.elements.reportedBalance.focus();
      form.elements.reportedBalance.select();
      return false;
    }
    state = normalizeState(state);
    persistState();
    renderAll();
    toast(
      result.status === "restored"
        ? "The previously resolved balance difference was restored."
        : "Balance difference recorded.",
    );
    return true;
  }

  function archiveActiveCycle() {
    const period = activePeriod();
    if (
      !window.confirm(
        `Archive ${formatDate(period.startDate)} – ${formatDate(
          period.endDate,
        )} and start the next pay cycle?`,
      )
    ) {
      return;
    }
    mutate("Pay cycle archived. A fresh cycle is ready.", () => {
      period.archiveSummary = summaryForPeriod(period);
      period.archiveOccurrences = {
        income: state.incomeSources.flatMap((item) =>
          scheduleOccurrences(item, period.startDate, period.endDate).map((occurrence) => ({
            ...occurrence,
            itemId: item.id,
            name: item.name,
            accountId: item.accountId || "",
            categoryId: item.categoryId || UNCATEGORISED_CATEGORY_ID,
          })),
        ),
        expenses: state.expenses.flatMap((item) =>
          scheduleOccurrences(item, period.startDate, period.endDate).map((occurrence) => ({
            ...occurrence,
            itemId: item.id,
            name: item.name,
            accountId: item.accountId || "",
            categoryId: item.categoryId || UNCATEGORISED_CATEGORY_ID,
            isEstimate: item.isEstimate === true,
          })),
        ),
      };
      period.closingBalances = Object.fromEntries(
        state.accounts.map((account) => [account.id, accountBalance(account.id, period)]),
      );
      period.status = "archived";
      period.archivedAt = new Date().toISOString();
      const nextStart = addDays(period.endDate, 1);
      const next = {
        id: uid("period"),
        startDate: nextStart,
        endDate: addDays(nextStart, payIntervalDays() - 1),
        status: "active",
        openingBalances: clone(period.closingBalances),
        createdAt: new Date().toISOString(),
      };
      state.periods.push(next);
      state.metadata.activePeriodId = next.id;
    });
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function validateImportedState(candidate) {
    if (!candidate || typeof candidate !== "object") throw new Error("The JSON root must be an object.");
    if (!Array.isArray(candidate.accounts) || !Array.isArray(candidate.transactions)) {
      throw new Error("This does not look like a Canopy data file.");
    }
    if (Number(candidate.schemaVersion || 0) > SCHEMA_VERSION) {
      throw new Error("This data file was created by a newer Canopy version.");
    }
    return normalizeState(candidate);
  }

  function scheduleBackupRequirementCheck() {
    clearTimeout(backupCheckTimer);
    backupCheckTimer = null;
    if (backupIsOverdue()) return;
    const dueAt = backupDueAt();
    const delay = Math.min(Math.max(dueAt - Date.now(), 1000), 2147483647);
    backupCheckTimer = setTimeout(() => {
      checkBackupRequirement();
      scheduleBackupRequirementCheck();
    }, delay);
  }

  function checkBackupRequirement() {
    const dialog = $("#backup-required-dialog");
    if (!dialog) return;
    backupGateActive = backupDemoActive || backupIsOverdue();
    $("#backup-required-filename").textContent = backupFilename();
    if (backupGateActive && !dialog.open) {
      showDialog(dialog);
    } else if (!backupGateActive && dialog.open) {
      closeDialog(dialog);
    }
    if ($("#settings-form")) renderSettings();
  }

  function exportDataBackup() {
    const exportedAt = new Date().toISOString();
    state.metadata.lastExternalBackupAt = exportedAt;
    state.metadata.backupWindowStartedAt = exportedAt;
    persistState();
    downloadJson(state, backupFilename());
    backupGateActive = false;
    backupDemoActive = false;
    const dialog = $("#backup-required-dialog");
    if (dialog?.open) closeDialog(dialog);
    renderSettings();
    scheduleBackupRequirementCheck();
    toast("External JSON backup download started.");
    showKnownUpdate();
  }

  function switchView(view) {
    if (!document.getElementById(`view-${view}`)) return;
    currentView = view;
    $$(".view").forEach((panel) => panel.classList.toggle("is-active", panel.id === `view-${view}`));
    $$(".nav-item[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    document.body.classList.remove("nav-open");
    $("#mobile-menu").setAttribute("aria-expanded", "false");
    if (view === "insights") renderInsights();
    if (view === "goals") requestAnimationFrame(renderGoalDetail);
    if (view === "calendar") requestAnimationFrame(() => initialiseCalendar());
    $("#main-content").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteTransaction(transactionId) {
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    const isArchived = periodById(transaction.periodId)?.status === "archived";
    const prompt = isArchived
      ? `Delete “${transaction.description}” from its archived cycle? This will refresh later account balances.`
      : `Delete “${transaction.description}”?`;
    if (!window.confirm(prompt)) return;
    mutate(isArchived ? "Archived transaction deleted. Later account balances were refreshed." : "Transaction deleted.", () => {
      applyGoalTransferChange(transaction, null);
      state.transactions = state.transactions.filter((item) => item.id !== transactionId);
      refreshArchivedPeriodAfterTransactionChange(transaction, null);
    });
    closeDialog($("#transaction-dialog"));
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-view]");
      if (nav) {
        switchView(nav.dataset.view);
        return;
      }
      const go = event.target.closest("[data-go-view]");
      if (go) {
        switchView(go.dataset.goView);
        return;
      }
      const tab = event.target.closest("[data-plan-tab]");
      if (tab) {
        currentPlanTab = tab.dataset.planTab;
        renderPlan();
        return;
      }
      const openEntity = event.target.closest("[data-open-entity]");
      if (openEntity) {
        openEntityDialog(openEntity.dataset.openEntity);
        return;
      }
      const editEntity = event.target.closest("[data-edit-entity]");
      if (editEntity) {
        openEntityDialog(editEntity.dataset.editEntity, editEntity.dataset.entityId);
        return;
      }
      const adjust = event.target.closest("[data-adjust-account]");
      if (adjust) {
        openAdjustmentDialog(adjust.dataset.adjustAccount);
        return;
      }
      const resolveAdjustment = event.target.closest("[data-resolve-account]");
      if (resolveAdjustment) {
        resolveAccountAdjustments(resolveAdjustment.dataset.resolveAccount);
        return;
      }
      const editTransaction = event.target.closest("[data-edit-transaction]");
      if (editTransaction) {
        openTransactionDialog(editTransaction.dataset.editTransaction);
        return;
      }
      const dismissUpdate = event.target.closest("[data-dismiss-update]");
      if (dismissUpdate) {
        dismissUpdateReminder();
        return;
      }
      const goalCard = event.target.closest("[data-select-goal]");
      if (goalCard) {
        selectedGoalId = goalCard.dataset.selectGoal;
        renderGoals();
        return;
      }
      const progressButton = event.target.closest("[data-add-goal-progress]");
      if (progressButton) {
        const goal = goalById(progressButton.dataset.addGoalProgress);
        if (!goal) return;
        const answer = window.prompt(
          `What is the reconciled amount saved toward “${goal.name}” now? Linked transfers and automatic withdrawal shares are already included.`,
          Number(goal.currentAmount || 0).toFixed(2),
        );
        if (answer === null) return;
        const amount = roundMoney(answer);
        if (!Number.isFinite(amount) || amount < 0) {
          toast("Enter a valid non-negative amount.", "error");
          return;
        }
        mutate("Goal balance reconciled.", () => {
          goal.currentAmount = amount;
          goal.updatedAt = new Date().toISOString();
        });
        return;
      }
      const close = event.target.closest("[data-close-dialog]");
      if (close) {
        closeDialog(close.closest("dialog"));
      }
    });

    document.addEventListener("keydown", (event) => {
      if (isBackupDemoShortcut(event)) {
        event.preventDefault();
        backupDemoActive = true;
        checkBackupRequirement();
        return;
      }
      const goalCard = event.target.closest?.("[data-select-goal]");
      if (goalCard && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        selectedGoalId = goalCard.dataset.selectGoal;
        renderGoals();
        return;
      }
      if (event.key === "Escape") {
        if ($("#update-available-dialog")?.open) {
          dismissUpdateReminder();
          return;
        }
        $$("dialog[open]:not(#backup-required-dialog)").forEach(closeDialog);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        const dialog = event.target.closest?.("dialog");
        const form = dialog?.querySelector("form");
        if (form) {
          event.preventDefault();
          form.requestSubmit();
        }
        return;
      }
      const editable = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if (!editable && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openTransactionDialog();
      }
      if (!editable && event.key === "/") {
        event.preventDefault();
        switchView("transactions");
        $("#transaction-search").focus();
      }
    });

    $("#mobile-menu").addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      $("#mobile-menu").setAttribute("aria-expanded", String(open));
    });

    $("#sidebar-collapse").addEventListener("click", () => {
      state.settings.sidebarCollapsed = state.settings.sidebarCollapsed !== true;
      persistState();
      applySidebarState();
    });

    $("#calendar-scroll").addEventListener("scroll", handleCalendarScroll, { passive: true });
    $("#calendar-today").addEventListener("click", () => {
      initialiseCalendar({ force: true });
    });

    $("#global-add-transaction").addEventListener("click", () => openTransactionDialog());
    $("#page-add-transaction").addEventListener("click", () => openTransactionDialog());
    $("#archive-cycle-button").addEventListener("click", archiveActiveCycle);
    $("#expense-buffer-account").addEventListener("change", (event) => {
      mutate("", () => {
        state.settings.expenseBufferAccountId = event.currentTarget.value;
      });
    });

    $("#theme-cycle").addEventListener("click", () => {
      const index = THEME_ORDER.indexOf(state.settings.theme);
      mutate("Theme changed.", () => {
        state.settings.theme = THEME_ORDER[(index + 1) % THEME_ORDER.length];
      });
    });

    $("#quick-transaction-form").addEventListener("submit", (event) => {
      event.preventDefault();
      submitQuickTransaction(event.currentTarget);
    });
    $("#quick-transaction-form").addEventListener("focusin", (event) => {
      panQuickEntryToFocusedControl(event.target);
    });
    $("#quick-transaction-form").elements.type.addEventListener("change", syncQuickTransactionTypeFields);
    $("#quick-transaction-form").elements.goalId.addEventListener("change", (event) => {
      applySelectedGoalAccount(event.currentTarget.form);
    });
    $("#quick-transaction-form").elements.description.addEventListener("input", (event) => {
      applyPlanSuggestion(
        $("#quick-transaction-form"),
        event.target.value,
        $("#quick-transaction-form").elements.type.value,
        $("#quick-suggestion"),
      );
    });

    $("#transaction-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (submitTransaction(event.currentTarget)) closeDialog($("#transaction-dialog"));
    });
    $("#transaction-type").addEventListener("change", syncTransactionTypeFields);
    $("#transaction-form").elements.goalId.addEventListener("change", (event) => {
      applySelectedGoalAccount(event.currentTarget.form);
    });
    $("#transaction-description").addEventListener("input", (event) => {
      applyPlanSuggestion(
        $("#transaction-form"),
        event.target.value,
        $("#transaction-form").elements.type.value,
        $("#transaction-suggestion"),
      );
    });
    $("#transaction-form").elements.isSplit.addEventListener("change", () => renderSplitLines());
    $("#transaction-form").elements.amount.addEventListener("input", updateSplitTotal);
    $("#add-split-line").addEventListener("click", () => {
      $("#split-lines").insertAdjacentHTML("beforeend", splitLineTemplate());
      updateSplitTotal();
    });
    $("#split-lines").addEventListener("input", (event) => {
      if (event.target.matches("[data-split-amount]")) syncArchivedAmountToSplitTotal();
      updateSplitTotal();
    });
    $("#split-lines").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-split]");
      if (remove) {
        remove.closest(".split-line").remove();
        syncArchivedAmountToSplitTotal();
        updateSplitTotal();
      }
    });
    $("#delete-transaction").addEventListener("click", () => {
      deleteTransaction($("#transaction-form").elements.id.value);
    });

    $("#entity-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (submitEntity(event.currentTarget)) closeDialog($("#entity-dialog"));
    });
    $("#entity-form-fields").addEventListener("change", (event) => {
      if (["scheduleMode", "mode"].includes(event.target.name)) syncEntityConditionalFields();
    });
    $("#delete-entity").addEventListener("click", deleteEntity);

    $("#adjustment-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (submitAdjustment(event.currentTarget)) closeDialog($("#adjustment-dialog"));
    });
    $("#adjustment-form").addEventListener("input", () => setAdjustmentMessage());

    $("#transaction-search").addEventListener("input", renderTransactions);
    $("#transaction-type-filter").addEventListener("change", renderTransactions);
    $("#insight-grouping").addEventListener("change", renderInsights);

    $("#settings-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      mutate("Settings saved.", () => {
        state.settings.currency = String(data.get("currency"));
        state.settings.payIntervalValue = Math.max(1, Number(data.get("payIntervalValue")) || 1);
        state.settings.payIntervalUnit = String(data.get("payIntervalUnit"));
        state.settings.primaryIncomeId = String(data.get("primaryIncomeId") || "");
        const period = activePeriod();
        period.startDate = String(data.get("periodStart"));
        period.endDate = addDays(period.startDate, payIntervalDays() - 1);
      });
    });
    $$(".theme-choices [data-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        mutate("Theme changed.", () => {
          state.settings.theme = button.dataset.themeChoice;
        });
      });
    });

    $("#export-data").addEventListener("click", exportDataBackup);
    $("#required-export-data").addEventListener("click", exportDataBackup);
    $("#check-for-updates").addEventListener("click", () => {
      void checkForAppUpdate({ force: true });
    });
    $("#automatic-update-checks").addEventListener("change", (event) => {
      state.settings.checkForUpdates = event.currentTarget.checked;
      persistState();
      updateCheckResult = "";
      renderUpdateStatus();
      if (event.currentTarget.checked) void checkForAppUpdate({ force: true });
    });
    $("#update-available-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      dismissUpdateReminder();
    });
    $("#backup-required-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
    });
    $("#backup-required-dialog").addEventListener("close", () => {
      if (backupGateActive) {
        requestAnimationFrame(() => showDialog($("#backup-required-dialog")));
      }
    });
    $("#import-data").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const imported = validateImportedState(JSON.parse(await file.text()));
        if (
          !window.confirm(
            "Replace the current budget with this file? Export the current budget first if you may need it again.",
          )
        ) {
          return;
        }
        state = imported;
        const importedAt = new Date().toISOString();
        state.metadata.lastExternalBackupAt = importedAt;
        state.metadata.backupWindowStartedAt = importedAt;
        selectedGoalId = state.goals[0]?.id || null;
        persistState();
        renderAll();
        checkBackupRequirement();
        scheduleBackupRequirementCheck();
        toast("JSON data imported.");
      } catch (error) {
        console.error(error);
        toast(error.message || "The JSON file could not be imported.", "error");
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        checkBackupRequirement();
        scheduleBackupRequirementCheck();
        void checkForAppUpdate();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (!backupGateActive && !backupIsOverdue()) return;
      event.preventDefault();
      event.returnValue = "";
    });

    window.addEventListener("resize", () => {
      clearTimeout(window.__canopyResizeTimer);
      window.__canopyResizeTimer = setTimeout(() => {
        if (currentView === "insights") renderInsights();
        if (currentView === "goals") renderGoalDetail();
        if (currentView === "calendar") updateCalendarVisibleRange();
      }, 150);
    });
  }

  async function initialise() {
    state.metadata.lastOpenedDate = localDate();
    persistState();

    bindEvents();
    $("#quick-transaction-form").elements.date.value = localDate();
    renderAll();
    checkBackupRequirement();
    scheduleBackupRequirementCheck();
    showKnownUpdate();
    void checkForAppUpdate();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      initialState,
      normalizeState,
      scheduleOccurrences,
      scheduleOccurrencesOnDate,
      scheduleText,
      summaryForPeriod,
      refreshArchivedPeriodAfterTransactionChange,
      cyclePaceSnapshot,
      goalProjection,
      savingsCommitmentSnapshot,
      accountBalance,
      transactionAllocations,
      transferDirection,
      transferStats,
      goalTransferEffect,
      transactionGoalEffect,
      automaticGoalImpacts,
      applyGoalTransferChange,
      goalTransferNet,
      goalProgressDate,
      recordBalanceDifference,
      categoryOptions,
      categoryTotalsForPeriod,
      uncategorisedActivity,
      manageableCategories,
      reassignCategoryReferences,
      plannedOccurrenceProgress,
      expenseBufferSnapshot,
      calendarTransactionEvents,
      calendarMovementEventMarkup,
      calendarMoreEventsMarkup,
      matchingPlan,
      addDays,
      addMonths,
      addYears,
      daysBetween,
      startOfCalendarWeek,
      backupFilename,
      backupIsOverdue,
      isBackupDemoShortcut,
      normaliseVersion,
      compareVersions,
      updatePlatform,
      updateScriptForPlatform,
      validatedUpdateManifest,
      versionFromAppSource,
      versionFromUpdateResponse,
      setStateForTest(nextState) {
        state = normalizeState(nextState);
        resetCalendarDataCache();
      },
      getStateForTest() {
        return state;
      },
    };
  } else {
    initialise().catch((error) => {
      console.error(error);
      toast("Canopy could not finish starting.", "error");
    });
  }
})();
