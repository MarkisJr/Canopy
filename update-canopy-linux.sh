#!/bin/sh

case $0 in
  */*) CANOPY_SCRIPT_DIR=${0%/*} ;;
  *) CANOPY_SCRIPT_DIR=. ;;
esac

CANOPY_REPO=$(CDPATH= cd -- "$CANOPY_SCRIPT_DIR" 2>/dev/null && pwd -P)
if [ -z "$CANOPY_REPO" ]; then
  printf "ERROR: The Canopy folder could not be located.\n"
  exit 1
fi

fail() {
  printf "\nUpdate stopped.\n"
  exit 1
}

printf "\nCanopy updater\nRepository: %s\n\n" "$CANOPY_REPO"

if ! command -v git >/dev/null 2>&1 || ! git --version >/dev/null 2>&1; then
  printf "ERROR: Git is not installed or is not available on PATH.\n"
  printf "Install Git and run this updater again.\n"
  fail
fi

if ! git -C "$CANOPY_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf "ERROR: This updater is not inside a Git repository.\n"
  printf "Keep this file in the main Canopy folder and try again.\n"
  fail
fi

if ! git -C "$CANOPY_REPO" remote get-url origin >/dev/null 2>&1; then
  printf "ERROR: This Canopy copy does not have an \"origin\" remote configured.\n"
  printf "Clone Canopy from its Git repository instead of copying only the app files.\n"
  fail
fi

if [ -n "$(git -C "$CANOPY_REPO" status --porcelain --untracked-files=no)" ]; then
  printf "ERROR: Tracked Canopy files have local changes.\n"
  printf "Commit, stash, or discard those changes before updating.\n"
  fail
fi

printf "Pulling the latest Canopy update...\n"
if ! git -C "$CANOPY_REPO" pull --ff-only; then
  printf "\nERROR: Canopy could not be updated.\n"
  printf "Review the Git message above. No local files were forcibly reset.\n"
  fail
fi

printf "\nCanopy is up to date.\n"
printf "Refresh or reopen index.html to load the new version.\n"
