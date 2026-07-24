@echo off
setlocal EnableExtensions
title Canopy updater

for %%I in ("%~dp0.") do set "CANOPY_REPO=%%~fI"

echo.
echo Canopy updater
echo Repository: "%CANOPY_REPO%"
echo.

where git >nul 2>&1
if errorlevel 1 goto :git_missing

git --version >nul 2>&1
if errorlevel 1 goto :git_missing

git -C "%CANOPY_REPO%" rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERROR: This updater is not inside a Git repository.
  echo Keep this file in the main Canopy folder and try again.
  goto :failed
)

git -C "%CANOPY_REPO%" remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo ERROR: This Canopy copy does not have an "origin" remote configured.
  echo Clone Canopy from its Git repository instead of copying only the app files.
  goto :failed
)

set "CANOPY_HAS_CHANGES="
for /f "delims=" %%A in ('git -C "%CANOPY_REPO%" status --porcelain --untracked-files=no') do (
  set "CANOPY_HAS_CHANGES=1"
)
if defined CANOPY_HAS_CHANGES (
  echo ERROR: Tracked Canopy files have local changes.
  echo Commit, stash, or discard those changes before updating.
  goto :failed
)

echo Pulling the latest Canopy update...
git -C "%CANOPY_REPO%" pull --ff-only
if errorlevel 1 (
  echo.
  echo ERROR: Canopy could not be updated.
  echo Review the Git message above. No local files were forcibly reset.
  goto :failed
)

echo.
echo Canopy is up to date.
echo Refresh or reopen index.html to load the new version.
goto :finished

:git_missing
echo ERROR: Git is not installed or is not available on PATH.
echo Install Git, restart this terminal, and run the updater again.

:failed
echo.
echo Update stopped.
pause
exit /b 1

:finished
echo.
pause
exit /b 0
