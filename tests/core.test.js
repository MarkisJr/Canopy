"use strict";

const assert = require("node:assert/strict");
const core = require("../app.js");

const state = core.initialState();
assert.equal(state.metadata.appVersion, "0.7.0");
assert.equal(
  state.settings.checkForUpdates,
  true,
  "new installations should offer automatic update checks by default",
);
assert.equal(core.normaliseVersion("v1.2.3"), "1.2.3");
assert.equal(core.normaliseVersion("version 1.2"), "");
assert.equal(core.compareVersions("0.7.0", "0.6.9"), 1);
assert.equal(core.compareVersions("1.0.0", "0.99.9"), 1);
assert.equal(core.compareVersions("0.7.0", "v0.7.0"), 0);
assert.deepEqual(core.validatedUpdateManifest({ version: "v0.8.0" }), {
  version: "0.8.0",
});
assert.equal(core.validatedUpdateManifest('{"version":"0.8.1"}').version, "0.8.1");
assert.equal(core.versionFromAppSource('const APP_VERSION = "0.6.0";'), "0.6.0");
assert.equal(
  core.versionFromUpdateResponse('{"version":"0.8.2"}', "manifest"),
  "0.8.2",
);
assert.equal(
  core.versionFromUpdateResponse('const APP_VERSION = "0.6.1";', "source"),
  "0.6.1",
);
assert.equal(
  core.updatePlatform(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Win32",
  ),
  "windows",
);
assert.equal(
  core.updatePlatform(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    "MacIntel",
  ),
  "macos",
);
assert.equal(
  core.updatePlatform("Mozilla/5.0 (X11; Linux x86_64) Firefox/142.0", "Linux x86_64"),
  "linux",
);
assert.equal(
  core.updatePlatform("Mozilla/5.0 (Linux; Android 15) Chrome/139.0 Mobile", "Linux armv8l"),
  "other",
  "a mobile Android browser should not be instructed to run the Linux updater",
);
assert.equal(
  core.updateScriptForPlatform("windows").filename,
  "update-canopy-windows.cmd",
);
assert.equal(
  core.updateScriptForPlatform("macos").filename,
  "update-canopy-macos.command",
);
assert.equal(
  core.updateScriptForPlatform("linux").filename,
  "update-canopy-linux.sh",
);
const period = state.periods[0];
period.startDate = "2026-03-09";
period.endDate = "2026-03-22";
period.openingBalances = {
  acct_everyday: 500,
  acct_bills: 100,
  acct_savings: 0,
};

state.expenses = [
  {
    id: "expense_monthly",
    name: "Gym",
    amount: 100,
    accountId: "acct_bills",
    categoryId: "cat_health",
    keywords: ["gym", "membership"],
    active: true,
    schedule: {
      mode: "recurring",
      anchorDate: "2026-03-15",
      interval: 1,
      unit: "months",
      expectedDates: [],
    },
  },
  {
    id: "expense_weekly",
    name: "Groceries",
    amount: 20,
    accountId: "acct_everyday",
    categoryId: "cat_groceries",
    keywords: ["market"],
    active: true,
    schedule: {
      mode: "recurring",
      anchorDate: "2026-03-09",
      interval: 1,
      unit: "weeks",
      expectedDates: [],
    },
  },
];

state.incomeSources = [
  {
    id: "income_main",
    name: "Main pay",
    amount: 1000,
    accountId: "acct_everyday",
    categoryId: "cat_income",
    keywords: ["payroll"],
    active: true,
    schedule: {
      mode: "recurring",
      anchorDate: "2026-03-09",
      interval: 2,
      unit: "weeks",
      expectedDates: [],
    },
  },
  {
    id: "income_irregular",
    name: "Ship work",
    amount: 600,
    accountId: "acct_everyday",
    categoryId: "cat_other_income",
    keywords: ["ship"],
    active: true,
    schedule: {
      mode: "irregular",
      anchorDate: "2026-03-09",
      interval: 1,
      unit: "months",
      expectedDates: [
        { date: "2026-03-20", amount: 300 },
        { date: "2026-04-20", amount: 800 },
      ],
    },
  },
];

state.settings.primaryIncomeId = "income_main";
state.transactions = [
  {
    id: "t1",
    periodId: period.id,
    date: "2026-03-10",
    type: "expense",
    amount: 120,
    accountId: "acct_everyday",
    description: "Market",
    categoryId: "cat_groceries",
    linkedPlanId: "expense_weekly",
    splits: [],
    createdAt: "2026-03-10T00:00:00.000Z",
  },
  {
    id: "t2",
    periodId: period.id,
    date: "2026-03-11",
    type: "refund",
    amount: 20,
    accountId: "acct_everyday",
    description: "Market refund",
    categoryId: "cat_groceries",
    linkedPlanId: "expense_weekly",
    splits: [],
    createdAt: "2026-03-11T00:00:00.000Z",
  },
  {
    id: "t3",
    periodId: period.id,
    date: "2026-03-12",
    type: "income",
    amount: 950,
    accountId: "acct_everyday",
    description: "Payroll",
    categoryId: "cat_income",
    linkedPlanId: "income_main",
    splits: [],
    createdAt: "2026-03-12T00:00:00.000Z",
  },
  {
    id: "t4",
    periodId: period.id,
    date: "2026-03-13",
    type: "transfer",
    amount: 100,
    accountId: "acct_everyday",
    toAccountId: "acct_bills",
    description: "Move to bills",
    splits: [],
    createdAt: "2026-03-13T00:00:00.000Z",
  },
];
state.adjustments = [
  {
    id: "a1",
    periodId: period.id,
    accountId: "acct_everyday",
    delta: 5,
    resolved: false,
  },
];

core.setStateForTest(state);

assert.deepEqual(
  core.scheduleOccurrences(state.expenses[0], period.startDate, period.endDate),
  [{ date: "2026-03-15", amount: 100 }],
  "monthly expenses should land only on their actual due date",
);
assert.deepEqual(
  core.scheduleOccurrences(state.expenses[0], "2026-03-23", "2026-04-05"),
  [],
  "a monthly bill should not be divided into a fortnight where it is not due",
);
assert.equal(
  core.scheduleOccurrences(state.expenses[1], period.startDate, period.endDate).length,
  2,
  "weekly schedules should produce two occurrences in a fortnight",
);
assert.deepEqual(
  core.scheduleOccurrences(state.incomeSources[1], period.startDate, period.endDate),
  [{ date: "2026-03-20", amount: 300 }],
  "irregular income should use only expected dates inside the cycle",
);

const summary = core.summaryForPeriod(period);
assert.equal(summary.budgetIncome, 1300);
assert.equal(summary.budgetExpenses, 140);
assert.equal(summary.actualIncome, 950);
assert.equal(summary.actualExpenses, 100);
assert.equal(summary.expenseDifference, 40);
assert.equal(summary.actualNet, 850);
assert.equal(summary.budgetNet, 1160);
assert.equal(summary.netDifference, -310);

state.transactions.push({
  id: "t5",
  periodId: period.id,
  date: "2026-03-14",
  type: "transfer",
  amount: 150,
  accountId: "acct_everyday",
  toAccountId: "acct_savings",
  transferNature: "savings-in",
  description: "Holiday savings",
  createdAt: "2026-03-14T00:00:00.000Z",
});
core.setStateForTest(state);
assert.equal(
  core.summaryForPeriod(period).actualExpenses,
  100,
  "a transfer into savings must not be counted as an expense",
);
assert.equal(
  core.summaryForPeriod(period).actualNet,
  850,
  "internal transfers must not change income-minus-expense net",
);
state.transactions.pop();
core.setStateForTest(state);

assert.equal(core.accountBalance("acct_everyday", period), 1255);
assert.equal(core.accountBalance("acct_bills", period), 200);
state.adjustments[0].resolved = true;
core.setStateForTest(state);
assert.equal(
  core.accountBalance("acct_everyday", period),
  1250,
  "a resolved temporary discrepancy should no longer alter the calculated balance",
);

assert.equal(core.matchingPlan("CITY GYM MONTHLY MEMBERSHIP", "expense").id, "expense_monthly");
assert.equal(core.matchingPlan("weekly payroll deposit", "income").id, "income_main");

const noIncomePaceState = core.initialState();
const noIncomePacePeriod = noIncomePaceState.periods[0];
noIncomePacePeriod.startDate = "2026-07-20";
noIncomePacePeriod.endDate = "2026-08-02";
noIncomePaceState.incomeSources = [];
noIncomePaceState.expenses = [
  {
    id: "pace_expenses",
    name: "Cycle expenses",
    amount: 649.02,
    accountId: "acct_bills",
    categoryId: "cat_bills",
    active: true,
    schedule: {
      mode: "recurring",
      anchorDate: "2026-07-21",
      interval: 1,
      unit: "months",
      expectedDates: [],
    },
  },
];
noIncomePaceState.transactions = [
  {
    id: "pace_spending",
    periodId: noIncomePacePeriod.id,
    date: "2026-07-22",
    type: "expense",
    amount: 178.89,
    accountId: "acct_bills",
    description: "Recorded spending",
  },
  {
    id: "pace_savings",
    periodId: noIncomePacePeriod.id,
    date: "2026-07-23",
    type: "transfer",
    amount: 700,
    accountId: "acct_everyday",
    toAccountId: "acct_savings",
    transferNature: "savings-in",
    description: "Moved to savings",
  },
];
core.setStateForTest(noIncomePaceState);
const noIncomePace = core.cyclePaceSnapshot(noIncomePacePeriod, "2026-07-26");
assert.deepEqual(
  {
    actualExpenses: noIncomePace.actualExpenses,
    budgetExpenses: noIncomePace.budgetExpenses,
    remainingPlanned: noIncomePace.remainingPlanned,
    expensePercent: noIncomePace.expensePercent,
    elapsedPercent: noIncomePace.elapsedPercent,
    cashFlow: noIncomePace.cashFlow,
    savingsMovement: noIncomePace.savingsMovement,
    incomeState: noIncomePace.incomeState,
  },
  {
    actualExpenses: 178.89,
    budgetExpenses: 649.02,
    remainingPlanned: 470.13,
    expensePercent: 27.6,
    elapsedPercent: 46,
    cashFlow: -178.89,
    savingsMovement: 700,
    incomeState: "none-scheduled",
  },
  "cycle pace should describe expense-plan usage without inventing a funding shortage when no income is scheduled",
);
const noPlanPace = core.cyclePaceSnapshot(noIncomePacePeriod, "2026-07-26", {
  budgetExpenses: 0,
  actualExpenses: 50,
  budgetIncome: 0,
  actualIncome: 0,
  actualNet: -50,
});
assert.equal(noPlanPace.expensePercent, null);
assert.equal(noPlanPace.visualExpenseRatio, 1);
assert.equal(noPlanPace.overPlan, true);
assert.equal(
  noPlanPace.remainingPlanned,
  0,
  "spending without an expense plan should be shown as unplanned rather than as a percentage",
);
const overPlanPace = core.cyclePaceSnapshot(noIncomePacePeriod, "2026-07-26", {
  budgetExpenses: 100,
  actualExpenses: 150,
  budgetIncome: 0,
  actualIncome: 0,
  actualNet: -150,
});
assert.equal(overPlanPace.expensePercent, 150);
assert.equal(overPlanPace.visualExpenseRatio, 1);
assert.equal(overPlanPace.overPlan, true);
assert.equal(overPlanPace.remainingPlanned, 0);

const affordabilityState = core.initialState();
const affordabilityPeriod = affordabilityState.periods[0];
affordabilityPeriod.startDate = "2026-03-09";
affordabilityPeriod.endDate = "2026-03-22";
affordabilityState.goals = [
  {
    id: "goal_contribution",
    name: "Emergency fund",
    accountId: "acct_savings",
    mode: "contribution",
    targetAmount: 1000,
    currentAmount: 100,
    contributionPerPeriod: 300,
    startDate: "2026-03-01",
  },
  {
    id: "goal_by_date",
    name: "Holiday",
    accountId: "acct_savings",
    mode: "date",
    targetAmount: 600,
    currentAmount: 0,
    endDate: "2026-04-20",
    startDate: "2026-03-01",
  },
  {
    id: "goal_complete",
    name: "Completed",
    accountId: "acct_savings",
    mode: "contribution",
    targetAmount: 100,
    currentAmount: 100,
    contributionPerPeriod: 50,
    startDate: "2026-03-01",
  },
  {
    id: "goal_future",
    name: "Later",
    accountId: "acct_savings",
    mode: "contribution",
    targetAmount: 500,
    currentAmount: 0,
    contributionPerPeriod: 50,
    startDate: "2026-04-01",
  },
];
core.setStateForTest(affordabilityState);
const affordability = core.savingsCommitmentSnapshot(
  affordabilityPeriod,
  "2026-03-20",
  {
    budgetIncome: 1000,
    budgetNet: 450,
  },
);
assert.deepEqual(
  {
    plannedSavings: affordability.plannedSavings,
    availableAfterGoals: affordability.availableAfterGoals,
    shortfall: affordability.shortfall,
    status: affordability.status,
    reason: affordability.reason,
    goalNames: affordability.goals.map((goal) => goal.name),
  },
  {
    plannedSavings: 500,
    availableAfterGoals: -50,
    shortfall: 50,
    status: "bad",
    reason: "shortfall",
    goalNames: ["Emergency fund", "Holiday"],
  },
  "active incomplete goals should reduce budgeted net without changing the net calculation itself",
);
assert.equal(
  core.savingsCommitmentSnapshot(affordabilityPeriod, "2026-03-20", {
    budgetIncome: 0,
    budgetNet: -100,
  }).reason,
  "no-income",
  "a no-income cycle should warn that goal contributions may rely on carried account balances",
);

const archiveEditState = core.initialState();
const firstArchivedPeriod = archiveEditState.periods[0];
firstArchivedPeriod.id = "period_archived_first";
firstArchivedPeriod.startDate = "2026-01-01";
firstArchivedPeriod.endDate = "2026-01-14";
firstArchivedPeriod.status = "archived";
firstArchivedPeriod.openingBalances = {
  acct_everyday: 1000,
  acct_bills: 0,
  acct_savings: 0,
};
firstArchivedPeriod.closingBalances = {
  acct_everyday: 900,
  acct_bills: 0,
  acct_savings: 0,
};
firstArchivedPeriod.archiveSummary = {
  budgetIncome: 0,
  actualIncome: 0,
  incomeDifference: 0,
  budgetExpenses: 120,
  actualExpenses: 100,
  expenseDifference: 20,
  budgetNet: -120,
  actualNet: -100,
  netDifference: 20,
};
firstArchivedPeriod.archiveOccurrences = {
  income: [],
  expenses: [{ date: "2026-01-08", amount: 120, itemId: "expense_trip", name: "Trip" }],
};
const secondArchivedPeriod = {
  id: "period_archived_second",
  startDate: "2026-01-15",
  endDate: "2026-01-28",
  status: "archived",
  openingBalances: { acct_everyday: 900, acct_bills: 0, acct_savings: 0 },
  closingBalances: { acct_everyday: 1100, acct_bills: 0, acct_savings: 0 },
  archiveSummary: {
    budgetIncome: 200,
    actualIncome: 200,
    incomeDifference: 0,
    budgetExpenses: 0,
    actualExpenses: 0,
    expenseDifference: 0,
    budgetNet: 200,
    actualNet: 200,
    netDifference: 0,
  },
  archiveOccurrences: { income: [{ date: "2026-01-15", amount: 200 }], expenses: [] },
  createdAt: "2026-01-15T00:00:00.000Z",
};
const currentAfterArchives = {
  id: "period_current_after_archives",
  startDate: "2026-01-29",
  endDate: "2026-02-11",
  status: "active",
  openingBalances: { acct_everyday: 1100, acct_bills: 0, acct_savings: 0 },
  createdAt: "2026-01-29T00:00:00.000Z",
};
const archivedSplitBefore = {
  id: "archived_split_transaction",
  periodId: firstArchivedPeriod.id,
  date: "2026-01-08",
  type: "expense",
  description: "International purchase and fee",
  amount: 100,
  accountId: "acct_everyday",
  categoryId: "cat_fun",
  splits: [
    { id: "split_purchase", categoryId: "cat_fun", amount: 90 },
    { id: "split_fee", categoryId: "cat_bills", amount: 10 },
  ],
  createdAt: "2026-01-08T00:00:00.000Z",
};
const secondPeriodIncome = {
  id: "second_period_income",
  periodId: secondArchivedPeriod.id,
  date: "2026-01-15",
  type: "income",
  description: "Pay",
  amount: 200,
  accountId: "acct_everyday",
  categoryId: "cat_income",
  splits: [],
  createdAt: "2026-01-15T00:00:00.000Z",
};
const currentExpense = {
  id: "current_period_expense",
  periodId: currentAfterArchives.id,
  date: "2026-01-30",
  type: "expense",
  description: "Current groceries",
  amount: 50,
  accountId: "acct_everyday",
  categoryId: "cat_groceries",
  splits: [],
  createdAt: "2026-01-30T00:00:00.000Z",
};
archiveEditState.periods = [firstArchivedPeriod, secondArchivedPeriod, currentAfterArchives];
archiveEditState.metadata.activePeriodId = currentAfterArchives.id;
archiveEditState.transactions = [archivedSplitBefore, secondPeriodIncome, currentExpense];
archiveEditState.adjustments = [];
core.setStateForTest(archiveEditState);
assert.equal(core.accountBalance("acct_everyday", currentAfterArchives), 1050);

const archivedSplitAfter = {
  ...archivedSplitBefore,
  amount: 130,
  splits: [
    archivedSplitBefore.splits[0],
    { ...archivedSplitBefore.splits[1], amount: 40 },
  ],
  updatedAt: "2026-02-01T00:00:00.000Z",
};
archiveEditState.transactions[0] = archivedSplitAfter;
core.setStateForTest(archiveEditState);
const archiveRefresh = core.refreshArchivedPeriodAfterTransactionChange(
  archivedSplitBefore,
  archivedSplitAfter,
);
assert.deepEqual(archiveRefresh.accountDeltas, { acct_everyday: -30 });
assert.equal(core.summaryForPeriod(firstArchivedPeriod).actualExpenses, 130);
assert.equal(
  core.summaryForPeriod(firstArchivedPeriod).budgetExpenses,
  120,
  "archive corrections should preserve the plan cached when the cycle was closed",
);
assert.equal(firstArchivedPeriod.closingBalances.acct_everyday, 870);
assert.equal(secondArchivedPeriod.openingBalances.acct_everyday, 870);
assert.equal(secondArchivedPeriod.closingBalances.acct_everyday, 1070);
assert.equal(currentAfterArchives.openingBalances.acct_everyday, 1070);
assert.equal(
  core.accountBalance("acct_everyday", currentAfterArchives),
  1020,
  "an archived fee correction should flow into the current account balance",
);
assert.equal(
  core.summaryForPeriod(secondArchivedPeriod).actualIncome,
  200,
  "later archived summaries should remain cached and untouched",
);
assert.equal(firstArchivedPeriod.archiveRevision, 1);

archiveEditState.transactions = archiveEditState.transactions.filter(
  (transaction) => transaction.id !== archivedSplitAfter.id,
);
core.setStateForTest(archiveEditState);
core.refreshArchivedPeriodAfterTransactionChange(archivedSplitAfter, null);
assert.equal(core.summaryForPeriod(firstArchivedPeriod).actualExpenses, 0);
assert.equal(firstArchivedPeriod.closingBalances.acct_everyday, 1000);
assert.equal(secondArchivedPeriod.openingBalances.acct_everyday, 1000);
assert.equal(secondArchivedPeriod.closingBalances.acct_everyday, 1200);
assert.equal(currentAfterArchives.openingBalances.acct_everyday, 1200);
assert.equal(
  core.accountBalance("acct_everyday", currentAfterArchives),
  1150,
  "deleting an archived transaction should reverse its balance effect through the current cycle",
);
assert.equal(firstArchivedPeriod.archiveRevision, 2);
core.setStateForTest(state);

const transferStats = core.transferStats([
  {
    type: "transfer",
    amount: 200,
    accountId: "acct_everyday",
    toAccountId: "acct_savings",
  },
  {
    type: "transfer",
    amount: 50,
    accountId: "acct_savings",
    toAccountId: "acct_bills",
  },
  {
    type: "transfer",
    amount: 100,
    accountId: "acct_everyday",
    toAccountId: "acct_bills",
  },
]);
assert.deepEqual(
  transferStats,
  {
    totalCount: 3,
    intoSavings: 200,
    intoCount: 1,
    outOfSavings: 50,
    outCount: 1,
    otherTransfers: 100,
    otherCount: 1,
    netSavings: 150,
  },
  "transfers should distinguish positive savings contributions from withdrawals and account funding",
);

state.goals = [
  {
    id: "goal_holiday",
    name: "Holiday",
    accountId: "acct_savings",
    targetAmount: 1000,
    currentAmount: 100,
    startingAmount: 100,
    startDate: "2026-03-23",
    endDate: "2026-03-25",
  },
];
core.setStateForTest(state);
assert.equal(
  core.goalTransferEffect({
    type: "transfer",
    amount: 80,
    accountId: "acct_everyday",
    toAccountId: "acct_savings",
    goalId: "goal_holiday",
  }),
  80,
  "a linked transfer into the goal account should be positive progress",
);
assert.equal(
  core.goalTransferEffect({
    type: "transfer",
    amount: 30,
    accountId: "acct_savings",
    toAccountId: "acct_bills",
    goalId: "goal_holiday",
  }),
  -30,
  "a linked transfer out of the goal account should reduce progress",
);

const originalContribution = {
  type: "transfer",
  amount: 80,
  accountId: "acct_everyday",
  toAccountId: "acct_savings",
  goalId: "goal_holiday",
  goalContribution: 80,
};
const editedContribution = {
  ...originalContribution,
  amount: 50,
  goalContribution: 50,
};
core.applyGoalTransferChange(null, originalContribution);
assert.equal(core.getStateForTest().goals[0].currentAmount, 180);
core.applyGoalTransferChange(originalContribution, editedContribution);
assert.equal(
  core.getStateForTest().goals[0].currentAmount,
  150,
  "editing a linked transfer should apply only the difference to goal progress",
);
core.applyGoalTransferChange(editedContribution, null);
assert.equal(
  core.getStateForTest().goals[0].currentAmount,
  100,
  "deleting a linked transfer should reverse its goal contribution",
);

const automaticWithdrawal = {
  id: "automatic_goal_withdrawal",
  periodId: period.id,
  date: "2026-03-24",
  type: "transfer",
  amount: 30,
  accountId: "acct_savings",
  toAccountId: "acct_bills",
  goalId: "",
  goalImpacts: [],
  createdAt: "2026-03-24T00:00:00.000Z",
};
automaticWithdrawal.goalImpacts = core.automaticGoalImpacts(automaticWithdrawal);
assert.deepEqual(
  automaticWithdrawal.goalImpacts,
  [
    {
      goalId: "goal_holiday",
      amount: -30,
      reason: "unlinked-savings-withdrawal",
    },
  ],
  "an unlinked savings withdrawal should automatically reduce the goal using that account",
);
core.applyGoalTransferChange(null, automaticWithdrawal);
assert.equal(core.getStateForTest().goals[0].currentAmount, 70);
core.getStateForTest().transactions.push(automaticWithdrawal);
assert.equal(
  core.goalProgressDate(state.goals[0], { endDate: "2026-03-25" }, "2026-03-23"),
  "2026-03-24",
  "an automatic withdrawal should advance the plotted actual point to its transaction date",
);
assert.equal(
  core.goalTransferNet(state.goals[0], period),
  -30,
  "automatic withdrawal shares should appear in the goal's cycle movement",
);

const editedAutomaticWithdrawal = {
  ...automaticWithdrawal,
  amount: 50,
  goalImpacts: [],
};
editedAutomaticWithdrawal.goalImpacts = core.automaticGoalImpacts(
  editedAutomaticWithdrawal,
  automaticWithdrawal,
);
core.applyGoalTransferChange(automaticWithdrawal, editedAutomaticWithdrawal);
assert.equal(
  core.getStateForTest().goals[0].currentAmount,
  50,
  "editing an automatic withdrawal should reverse its previous effect before applying the new one",
);
core.applyGoalTransferChange(editedAutomaticWithdrawal, null);
assert.equal(
  core.getStateForTest().goals[0].currentAmount,
  100,
  "deleting an automatic withdrawal should restore its goal effect",
);
core.getStateForTest().transactions = core
  .getStateForTest()
  .transactions.filter((transaction) => transaction.id !== automaticWithdrawal.id);

const pooledGoalState = core.initialState();
const pooledPeriod = pooledGoalState.periods[0];
pooledPeriod.startDate = "2026-04-01";
pooledPeriod.endDate = "2026-04-14";
pooledGoalState.goals = [
  {
    id: "goal_large",
    name: "Large goal",
    accountId: "acct_savings",
    targetAmount: 1000,
    currentAmount: 300,
    startingAmount: 300,
    startDate: "2026-04-01",
  },
  {
    id: "goal_small",
    name: "Small goal",
    accountId: "acct_savings",
    targetAmount: 500,
    currentAmount: 100,
    startingAmount: 100,
    startDate: "2026-04-01",
  },
];
core.setStateForTest(pooledGoalState);
const pooledWithdrawal = {
  id: "pooled_withdrawal",
  periodId: pooledPeriod.id,
  date: "2026-04-05",
  type: "transfer",
  amount: 80,
  accountId: "acct_savings",
  toAccountId: "acct_bills",
  goalId: "",
};
pooledWithdrawal.goalImpacts = core.automaticGoalImpacts(pooledWithdrawal);
assert.deepEqual(
  pooledWithdrawal.goalImpacts,
  [
    {
      goalId: "goal_large",
      amount: -60,
      reason: "unlinked-savings-withdrawal",
    },
    {
      goalId: "goal_small",
      amount: -20,
      reason: "unlinked-savings-withdrawal",
    },
  ],
  "one withdrawal should be allocated proportionally across goals sharing the savings account",
);
core.applyGoalTransferChange(null, pooledWithdrawal);
assert.deepEqual(
  core.getStateForTest().goals.map((goal) => goal.currentAmount),
  [240, 80],
  "the pooled withdrawal must be counted once rather than once per goal",
);
assert.deepEqual(
  core.automaticGoalImpacts({
    ...pooledWithdrawal,
    goalId: "goal_large",
  }),
  [],
  "an explicitly selected goal should suppress automatic allocation",
);
assert.deepEqual(
  core.automaticGoalImpacts({
    ...pooledWithdrawal,
    accountId: "acct_everyday",
    toAccountId: "acct_savings",
  }),
  [],
  "unlinked deposits should not receive automatic goal credit",
);

const legacyWithdrawalState = core.initialState();
legacyWithdrawalState.schemaVersion = 3;
legacyWithdrawalState.goals = [
  {
    id: "goal_legacy",
    name: "Legacy goal",
    accountId: "acct_savings",
    targetAmount: 500,
    currentAmount: 100,
    startingAmount: 100,
    startDate: "2026-04-01",
  },
];
legacyWithdrawalState.transactions = [
  {
    id: "legacy_unlinked_withdrawal",
    periodId: legacyWithdrawalState.periods[0].id,
    date: "2026-04-05",
    type: "transfer",
    amount: 30,
    accountId: "acct_savings",
    toAccountId: "acct_bills",
    goalId: "",
  },
];
const migratedWithdrawalState = core.normalizeState(legacyWithdrawalState);
assert.equal(migratedWithdrawalState.goals[0].currentAmount, 70);
assert.equal(
  migratedWithdrawalState.transactions[0].goalImpacts[0].amount,
  -30,
  "existing unlinked withdrawals should be migrated into visible goal history once",
);
assert.equal(
  core.normalizeState(migratedWithdrawalState).goals[0].currentAmount,
  70,
  "normalising migrated data again must not apply an automatic withdrawal twice",
);

core.setStateForTest(state);
state.transactions.push({
  id: "future_goal_transfer",
  periodId: period.id,
  date: "2026-03-24",
  type: "transfer",
  amount: 500,
  accountId: "acct_everyday",
  toAccountId: "acct_savings",
  goalId: "goal_holiday",
  goalContribution: 500,
  createdAt: "2026-03-23T00:00:00.000Z",
});
core.setStateForTest(state);
assert.equal(
  core.goalProgressDate(state.goals[0], { endDate: "2026-03-25" }, "2026-03-23"),
  "2026-03-24",
  "a future-dated linked transfer should advance the plotted actual point to its transaction date",
);
state.transactions.push({
  id: "after_goal_transfer",
  periodId: period.id,
  date: "2026-03-27",
  type: "transfer",
  amount: 100,
  accountId: "acct_everyday",
  toAccountId: "acct_savings",
  goalId: "goal_holiday",
  goalContribution: 100,
  createdAt: "2026-03-23T00:00:00.000Z",
});
core.setStateForTest(state);
assert.equal(
  core.goalProgressDate(state.goals[0], { endDate: "2026-03-25" }, "2026-03-23"),
  "2026-03-25",
  "the plotted actual point should not move beyond the goal end date",
);
state.transactions = state.transactions.filter(
  (transaction) => !["future_goal_transfer", "after_goal_transfer"].includes(transaction.id),
);
core.setStateForTest(state);

const refundAllocations = core.transactionAllocations({
  type: "refund",
  amount: 45,
  splits: [
    { categoryId: "cat_health", linkedPlanId: "expense_monthly", amount: 30 },
    { categoryId: "cat_groceries", linkedPlanId: "expense_weekly", amount: 15 },
  ],
});
assert.deepEqual(
  refundAllocations.map((allocation) => allocation.amount),
  [-30, -15],
  "refund splits should reduce actual expenses",
);

assert.equal(core.addMonths("2024-01-31", 1), "2024-02-29");
assert.equal(core.addYears("2024-02-29", 1), "2025-02-28");
assert.deepEqual(
  core.scheduleOccurrences(
    {
      amount: 10,
      active: true,
      schedule: {
        mode: "recurring",
        anchorDate: "2024-01-31",
        interval: 1,
        unit: "months",
      },
    },
    "2024-02-01",
    "2024-03-31",
  ),
  [
    { date: "2024-02-29", amount: 10 },
    { date: "2024-03-31", amount: 10 },
  ],
  "month-end schedules should return to the anchor day after a shorter month",
);

const progressState = core.initialState();
const progressPeriod = progressState.periods[0];
progressPeriod.startDate = "2026-08-03";
progressPeriod.endDate = "2026-08-16";
progressState.expenses = [
  {
    id: "progress_groceries",
    name: "Groceries",
    amount: 140,
    active: true,
    accountId: "acct_everyday",
    schedule: {
      mode: "recurring",
      anchorDate: "2026-08-03",
      interval: 1,
      unit: "weeks",
      expectedDates: [],
    },
  },
  {
    id: "progress_rent",
    name: "Rent",
    amount: 500,
    active: true,
    accountId: "acct_bills",
    schedule: {
      mode: "recurring",
      anchorDate: "2026-08-03",
      interval: 1,
      unit: "months",
      expectedDates: [],
    },
  },
  {
    id: "progress_utilities",
    name: "Utilities",
    amount: 50,
    active: true,
    accountId: "acct_bills",
    schedule: {
      mode: "recurring",
      anchorDate: "2026-08-07",
      interval: 1,
      unit: "months",
      expectedDates: [],
    },
  },
];
progressState.incomeSources = [
  {
    id: "progress_main_pay",
    name: "Main pay",
    amount: 1000,
    active: true,
    accountId: "acct_everyday",
    schedule: {
      mode: "recurring",
      anchorDate: "2026-08-03",
      interval: 2,
      unit: "weeks",
      expectedDates: [],
    },
  },
  {
    id: "progress_bonus",
    name: "Bonus",
    amount: 300,
    active: true,
    accountId: "acct_everyday",
    schedule: {
      mode: "irregular",
      expectedDates: [{ date: "2026-08-08", amount: 300 }],
    },
  },
  {
    id: "progress_side_pay",
    name: "Side pay",
    amount: 500,
    active: true,
    accountId: "acct_everyday",
    schedule: {
      mode: "irregular",
      expectedDates: [{ date: "2026-08-12", amount: 500 }],
    },
  },
];
progressState.transactions = [
  {
    id: "progress_grocery_partial",
    periodId: progressPeriod.id,
    date: "2026-08-04",
    type: "expense",
    amount: 100,
    linkedPlanId: "progress_groceries",
  },
  {
    id: "progress_grocery_exact",
    periodId: progressPeriod.id,
    date: "2026-08-10",
    type: "expense",
    amount: 140,
    linkedPlanId: "progress_groceries",
  },
  {
    id: "progress_utilities_over",
    periodId: progressPeriod.id,
    date: "2026-08-07",
    type: "expense",
    amount: 70,
    linkedPlanId: "",
    splits: [
      {
        categoryId: "cat_bills",
        linkedPlanId: "progress_utilities",
        amount: 70,
      },
    ],
  },
  {
    id: "progress_pay_under",
    periodId: progressPeriod.id,
    date: "2026-08-03",
    type: "income",
    amount: 900,
    linkedPlanId: "progress_main_pay",
  },
  {
    id: "progress_bonus_over",
    periodId: progressPeriod.id,
    date: "2026-08-08",
    type: "income",
    amount: 350,
    linkedPlanId: "progress_bonus",
  },
  {
    id: "progress_side_pay_exact",
    periodId: progressPeriod.id,
    date: "2026-08-12",
    type: "income",
    amount: 500,
    linkedPlanId: "progress_side_pay",
  },
];
core.setStateForTest(progressState);
const occurrenceProgress = core.plannedOccurrenceProgress(progressPeriod, "2026-08-04");
assert.equal(
  occurrenceProgress[0].item.id,
  "progress_rent",
  "scheduled items with no linked transaction should be sorted ahead of recorded activity",
);
assert.equal(occurrenceProgress[0].status, "pending");
assert.equal(occurrenceProgress[0].overdue, true);

const firstGroceries = occurrenceProgress.find(
  (entry) => entry.item.id === "progress_groceries" && entry.date === "2026-08-03",
);
const secondGroceries = occurrenceProgress.find(
  (entry) => entry.item.id === "progress_groceries" && entry.date === "2026-08-10",
);
assert.deepEqual(
  { status: firstGroceries.status, actual: firstGroceries.actual, planned: firstGroceries.planned },
  { status: "partial", actual: 100, planned: 140 },
  "a linked grocery transaction below plan should show partial progress for its nearest occurrence",
);
assert.equal(secondGroceries.status, "exact");
assert.equal(secondGroceries.actual, 140);

const utilitiesProgress = occurrenceProgress.find(
  (entry) => entry.item.id === "progress_utilities",
);
assert.equal(utilitiesProgress.status, "over");
assert.equal(utilitiesProgress.tone, "bad");
assert.equal(utilitiesProgress.difference, 20);

const mainPayProgress = occurrenceProgress.find(
  (entry) => entry.item.id === "progress_main_pay",
);
const bonusProgress = occurrenceProgress.find((entry) => entry.item.id === "progress_bonus");
const sidePayProgress = occurrenceProgress.find((entry) => entry.item.id === "progress_side_pay");
assert.equal(mainPayProgress.status, "partial");
assert.equal(mainPayProgress.difference, -100);
assert.equal(bonusProgress.status, "over");
assert.equal(bonusProgress.tone, "good");
assert.equal(sidePayProgress.status, "exact");
assert.equal(
  occurrenceProgress.slice(1, 3).every((entry) => entry.status === "partial"),
  true,
  "partially fulfilled items should follow pending items before fully matched activity",
);

progressPeriod.openingBalances.acct_bills = 300;
const billsBuffer = core.expenseBufferSnapshot("acct_bills", progressPeriod, "2026-08-04");
assert.deepEqual(
  {
    currentBalance: billsBuffer.currentBalance,
    remainingExpected: billsBuffer.remainingExpected,
    difference: billsBuffer.difference,
    shortfall: billsBuffer.shortfall,
    overdueRemaining: billsBuffer.overdueRemaining,
    partialRemaining: billsBuffer.partialRemaining,
  },
  {
    currentBalance: 300,
    remainingExpected: 500,
    difference: -200,
    shortfall: 200,
    overdueRemaining: 500,
    partialRemaining: 0,
  },
  "the expense buffer should compare an account balance with only its unpaid planned expenses",
);

progressPeriod.openingBalances.acct_everyday = 75;
const everydayBuffer = core.expenseBufferSnapshot(
  "acct_everyday",
  progressPeriod,
  "2026-08-04",
);
assert.deepEqual(
  {
    remainingExpected: everydayBuffer.remainingExpected,
    difference: everydayBuffer.difference,
    buffer: everydayBuffer.buffer,
    overdueRemaining: everydayBuffer.overdueRemaining,
    partialRemaining: everydayBuffer.partialRemaining,
  },
  {
    remainingExpected: 40,
    difference: 35,
    buffer: 35,
    overdueRemaining: 40,
    partialRemaining: 40,
  },
  "partial and overdue occurrences should contribute only their unpaid remainder",
);

progressState.settings.expenseBufferAccountId = "acct_everyday";
assert.equal(
  core.normalizeState(progressState).settings.expenseBufferAccountId,
  "acct_everyday",
  "a valid expense-buffer account choice should survive state normalisation",
);

const categoryState = core.initialState();
const categoryPeriod = categoryState.periods[0];
categoryPeriod.startDate = "2026-07-20";
categoryPeriod.endDate = "2026-08-02";
categoryState.categories.push({
  id: "cat_temporary",
  name: "Temporary",
  type: "both",
  color: "#123456",
});
categoryState.transactions = [
  {
    id: "uncategorised_expense",
    periodId: categoryPeriod.id,
    date: "2026-07-24",
    type: "expense",
    amount: 25,
    accountId: "acct_everyday",
    categoryId: "cat_temporary",
    splits: [],
  },
  {
    id: "partly_uncategorised_expense",
    periodId: categoryPeriod.id,
    date: "2026-07-24",
    type: "expense",
    amount: 20,
    accountId: "acct_everyday",
    categoryId: "cat_health",
    splits: [
      { categoryId: "cat_temporary", amount: 15 },
      { categoryId: "cat_health", amount: 5 },
    ],
  },
  {
    id: "uncategorised_income",
    periodId: categoryPeriod.id,
    date: "2026-07-24",
    type: "income",
    amount: 100,
    accountId: "acct_everyday",
    categoryId: "cat_temporary",
    splits: [],
  },
  {
    id: "category_free_transfer",
    periodId: categoryPeriod.id,
    date: "2026-07-24",
    type: "transfer",
    amount: 50,
    accountId: "acct_everyday",
    toAccountId: "acct_savings",
    categoryId: "",
    splits: [],
  },
];
categoryState.expenses = [{ id: "planned_expense", categoryId: "cat_temporary" }];
categoryState.incomeSources = [{ id: "planned_income", categoryId: "cat_temporary" }];
core.setStateForTest(categoryState);

const categoryMarkup = core.categoryOptions("", "expense");
assert.equal(
  (categoryMarkup.match(/>Uncategorised<\/option>/g) || []).length,
  1,
  "category dropdowns should contain exactly one intrinsic Uncategorised option",
);
assert.equal(
  core.manageableCategories().some((category) => category.id === "cat_uncategorised"),
  false,
  "the intrinsic Uncategorised category should stay out of category management",
);
assert.equal(
  core.reassignCategoryReferences("cat_temporary"),
  5,
  "deleting a category should reassign transactions, splits, expenses, and income sources",
);
assert.equal(categoryState.transactions[0].categoryId, "cat_uncategorised");
assert.equal(categoryState.transactions[1].splits[0].categoryId, "cat_uncategorised");
assert.equal(categoryState.expenses[0].categoryId, "cat_uncategorised");
assert.equal(categoryState.incomeSources[0].categoryId, "cat_uncategorised");
assert.deepEqual(
  core.uncategorisedActivity(categoryPeriod),
  { count: 3, spending: 40, income: 100 },
  "uncategorised spending and income should remain visible as current-cycle activity",
);
assert.equal(
  core.categoryTotalsForPeriod(categoryPeriod).get("cat_uncategorised"),
  40,
  "the insights category breakdown should retain uncategorised spending",
);

const missingFallbackState = core.initialState();
missingFallbackState.categories = missingFallbackState.categories.filter(
  (category) => category.id !== "cat_uncategorised",
);
const repairedCategoryState = core.normalizeState(missingFallbackState);
assert.equal(
  repairedCategoryState.categories.find((category) => category.id === "cat_uncategorised")?.name,
  "Uncategorised",
  "normalisation should restore the intrinsic fallback category if imported data omits it",
);

const reconciliationState = core.initialState();
const reconciliationPeriod = reconciliationState.periods[0];
reconciliationPeriod.startDate = "2026-07-20";
reconciliationPeriod.endDate = "2026-08-02";
reconciliationPeriod.openingBalances.acct_savings = 0;
core.setStateForTest(reconciliationState);

const firstSavingsCheck = core.recordBalanceDifference({
  accountId: "acct_savings",
  reportedBalance: 725,
  date: "2026-07-24",
  note: "Initial bank balance",
});
assert.equal(firstSavingsCheck.status, "created");
assert.equal(core.accountBalance("acct_savings", reconciliationPeriod), 725);

firstSavingsCheck.adjustment.resolved = true;
firstSavingsCheck.adjustment.resolvedAt = "2026-07-24T01:00:00.000Z";
assert.equal(
  core.accountBalance("acct_savings", reconciliationPeriod),
  0,
  "resolving a temporary balance correction should remove it from the calculated balance",
);

const repeatedSavingsCheck = core.recordBalanceDifference({
  accountId: "acct_savings",
  reportedBalance: 725,
  date: "2026-07-24",
  note: "Initial bank balance",
});
assert.equal(
  repeatedSavingsCheck.status,
  "restored",
  "re-entering the same resolved balance check should restore it instead of rejecting it",
);
assert.equal(reconciliationState.adjustments.length, 1);
assert.equal(repeatedSavingsCheck.adjustment.resolved, false);
assert.deepEqual(repeatedSavingsCheck.adjustment.resolutionHistory, [
  "2026-07-24T01:00:00.000Z",
]);
assert.equal(
  core.accountBalance("acct_savings", reconciliationPeriod),
  725,
  "restoring a resolved balance check should restore the reported account balance",
);

const matchingSavingsCheck = core.recordBalanceDifference({
  accountId: "acct_savings",
  reportedBalance: 725,
  date: "2026-07-24",
  note: "Initial bank balance",
});
assert.equal(matchingSavingsCheck.status, "matches");
assert.equal(
  reconciliationState.adjustments.length,
  1,
  "submitting the currently calculated balance should not create a duplicate correction",
);

const backupState = core.initialState();
backupState.metadata.lastExternalBackupAt = "2026-07-20T00:00:00.000Z";
backupState.periods[0].startDate = "2026-07-13";
backupState.periods[0].endDate = "2026-07-26";
core.setStateForTest(backupState);
assert.equal(
  core.backupIsOverdue(Date.parse("2026-07-21T23:59:59.999Z")),
  false,
  "an external backup should remain current until the full 48 hours have elapsed",
);
assert.equal(
  core.backupIsOverdue(Date.parse("2026-07-22T00:00:00.000Z")),
  true,
  "the external backup gate should become due at 48 hours",
);
assert.equal(
  core.backupFilename("2026-07-23", backupState.periods[0]),
  "canopy-backup_2026-07-23_pay-period_2026-07-13_to_2026-07-26.json",
  "backup filenames should include the export date and current pay period",
);
assert.equal(
  core.isBackupDemoShortcut({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: true,
    key: "B",
  }),
  true,
  "the backup demonstration shortcut should work on Windows and Linux",
);
assert.equal(
  core.isBackupDemoShortcut({
    ctrlKey: false,
    metaKey: true,
    altKey: true,
    shiftKey: true,
    key: "b",
  }),
  true,
  "the backup demonstration shortcut should work on macOS",
);
assert.equal(
  core.isBackupDemoShortcut({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    key: "b",
  }),
  false,
  "the shortcut should require the full key combination to avoid accidental activation",
);

const legacyState = core.initialState();
legacyState.schemaVersion = 2;
legacyState.metadata.createdAt = "2026-07-01T00:00:00.000Z";
delete legacyState.metadata.lastExternalBackupAt;
delete legacyState.metadata.backupWindowStartedAt;
legacyState.backups = [{ id: "browser_only_backup" }];
const migratedState = core.normalizeState(legacyState);
assert.equal(migratedState.schemaVersion, 4);
assert.equal(
  migratedState.metadata.backupWindowStartedAt,
  legacyState.metadata.createdAt,
  "existing data should use its creation time as the initial backup-window anchor",
);
assert.equal(migratedState.metadata.lastExternalBackupAt, null);
assert.equal(
  Object.hasOwn(migratedState, "backups"),
  false,
  "browser-only backups should be removed during schema migration",
);

console.log("Canopy core tests passed.");
