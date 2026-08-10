# Canopy

Canopy is a private, browser-only budget manager. It runs directly from the files in this
repository: no hosted server, account, package installation, build step, or internet connection is
required.

## Start

1. Open `index.html` in a current desktop browser.
2. Add or edit your accounts in **Plan → Accounts**.
3. Add income sources and recurring expenses with their real dates and intervals.
4. Record transactions with the quick row or the **Add transaction** button.

Chrome, Edge, Firefox, Safari, and other modern browsers can use the app and export/import JSON.

## What is included

- Dated recurring expenses at arbitrary day, week, month, or year intervals
- Recurring and irregular income dates, plus an optional primary income source
- Current pay cycle length and start date
- Account and category management with a protected, intrinsic Uncategorised fallback
- Fast transaction entry, description-keyword suggestions, editing, refunds, transfers, and
  multi-category splits
- Two-sided account transfers that stay outside income and expense totals, with savings deposits,
  withdrawals, and transfer frequency reported separately
- Planned-item links so actual spending can be associated with a bill or income source
- Budgeted, actual, and difference scorecards for income, expenses, and net cash
- Outstanding-first cycle schedule with partial, exact, over-budget, underpaid, and overpaid status
- Manual account reconciliation with visible, cycle-specific unexplained differences
- Cycle archiving with balances, transactions, totals, and discrepancies retained; archived
  transactions can be corrected later with their account changes carried into current balances
- Savings goals planned either by finish date or contribution per pay cycle
- Optional transfer-to-goal links so actual savings deposits increase progress and withdrawals from
  the goal account reduce it
- Goal pace and period/month comparison charts drawn locally by the browser
- Power dark, forest fern, and blush stationery themes
- Optional once-daily GitHub version checks with a platform-specific updater prompt
- A required external JSON backup every 48 hours, plus portable JSON import

The schedule engine counts an expense only when its due date falls in the active cycle. A monthly
bill is therefore not divided across fortnights; it appears at its full amount in the fortnight in
which it is due.

Uncategorised is a protected system fallback rather than a user-managed category. Deleting a
category reassigns its recurring expenses, income sources, transactions, and transaction splits to
Uncategorised so those amounts remain visible in reporting.

## Data and privacy

The normal data store is one human-readable JSON object saved in browser storage. Budget data is
never sent over the network. When automatic update checks are enabled, Canopy makes one request to
GitHub at most once per day to read `version.json`; this can be disabled in **Settings**, and failed
or offline checks never interrupt the app. Browser storage is the working copy, not a durable
backup: clearing site data, resetting a browser profile, or some privacy tools can erase it.

Canopy therefore requires an external export at least every 48 hours. When the deadline passes, a
modal blocks the app until **Export data backup** is pressed. It suggests a filename containing the
export date and active pay-period dates, for example:

```text
canopy-backup_2026-07-23_pay-period_2026-07-20_to_2026-08-02.json
```

The downloaded JSON file is independent of browser storage and can be restored with **Import
JSON**. Canopy records that the export was started, but browsers do not let a page verify where the
file was ultimately saved.

Important:

- Export before moving the repository or renaming `index.html`. Some browsers scope local storage
  to the file location.
- The browser controls whether a Save As window appears and which folder it initially shows. Set
  the browser's download preference to “ask where to save” and choose your preferred data folder.
- The overdue modal cannot be dismissed within Canopy without exporting. A webpage cannot make a
  browser tab literally impossible to close; the app also requests the browser's standard
  leave-page confirmation while a backup is overdue, but browsers may not show it in every case.

## Git distribution and updates

Application code and artwork can be distributed with Git. Personal data should not be committed.
The supplied `.gitignore` excludes `budget-data.json`, the `data/` JSON files, and backup JSON files.

### Update an installed copy

Each updater finds the repository from its own location, so Canopy can be cloned into any folder:

- **Windows:** double-click `update-canopy-windows.cmd`.
- **macOS:** double-click `update-canopy-macos.command`. If macOS reports that it is not executable,
  run `chmod +x update-canopy-macos.command` once in Terminal.
- **Linux:** run `./update-canopy-linux.sh`. If needed, run
  `chmod +x update-canopy-linux.sh` once, or use `sh update-canopy-linux.sh`.

The scripts check for Git, a valid repository, an `origin` remote, and local changes before running
`git pull --ff-only`. They never reset local files. If Git is unavailable or the update cannot be
applied safely, the terminal displays an error and stops.

When a newer version is published, Canopy can detect it while the device is online and show the
correct updater filename for Windows, macOS, or Linux. The browser deliberately cannot launch that
local script: the user must open the installed Canopy folder and run it. Dismissing the notice
snoozes it for one day.

A safe update routine for users is:

1. Export a current JSON backup.
2. Close the Canopy tab.
3. Run the updater for the operating system.
4. Reopen `index.html`.

### Publish Canopy from this working folder

The repository can remain at its current filesystem path. Create an empty remote repository without
adding a remote README or `.gitignore`, then run the following once from the Canopy folder:

```powershell
git remote add origin https://github.com/YOUR-NAME/YOUR-REPOSITORY.git
git add .
git add --chmod=+x update-canopy-macos.command update-canopy-linux.sh
git commit -m "Initial Canopy release"
git push -u origin main
```

For later releases:

```powershell
git status
git add .
git commit -m "Describe the Canopy update"
git push
```

Before publishing a release, update both `APP_VERSION` near the top of `app.js` and the version in
`version.json`. Canopy compares those values using `major.minor.patch` version numbers.
Until an older installation has received the release containing `version.json`, its update check
can read the published `APP_VERSION` from `app.js` as a compatibility fallback.

Friends should install Canopy with `git clone` rather than copying the files manually. A clone
automatically receives the `origin` remote and upstream branch required by the updater.

## Keyboard shortcuts

- `N`: open a full transaction form
- `/`: open and focus transaction search
- `Ctrl+Enter` or `Cmd+Enter`: save an open dialog
- `Esc`: close a dialog
- In the quick row: `Tab` moves across fields and `Enter` saves
- Backup demonstration: press `Ctrl+Alt+Shift+B` on Windows/Linux or
  `Cmd+Option+Shift+B` on macOS to force the mandatory backup window, even during the safe backup
  period. This opens the real backup gate, so use **Export data backup** to dismiss it.

## Data shape

The exported file includes:

```json
{
  "schemaVersion": 4,
  "metadata": {
    "lastExternalBackupAt": "2026-07-23T08:00:00.000Z",
    "backupWindowStartedAt": "2026-07-23T08:00:00.000Z"
  },
  "settings": {},
  "accounts": [],
  "categories": [],
  "incomeSources": [],
  "expenses": [],
  "transactions": [],
  "adjustments": [],
  "goals": [],
  "periods": []
}
```

Records use stable string IDs and ISO `YYYY-MM-DD` dates. Archived period summaries are frozen so a
later edit to a recurring plan does not rewrite the historical scorecard.

A transfer is one transaction with `accountId` as its source and `toAccountId` as its destination.
`transferNature` records whether it moved into savings, out of savings, or between other accounts.
An optional `goalId` and signed `goalContribution` link the movement to a savings goal. Transfers
affect both account balances but are deliberately excluded from income, expense, and net-spending
totals.

A balance check is stored as a temporary adjustment. Resolving it removes the correction from the
calculated balance after the missing transaction has been recorded. Re-entering the same reported
balance and note restores a mistakenly resolved check and retains its resolution history.

## Development check

Canopy has no runtime dependency. If Node.js is available, the core schedule and accounting checks
can be run with:

```powershell
node tests/core.test.js
```
