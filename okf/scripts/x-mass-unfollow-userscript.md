---
type: Script
title: X Mass Unfollow
description: Bulk-unfollow on X with a reviewable queue, whitelist and protected-account skip rule.
repo: https://github.com/chirag127/x-mass-unfollow-userscript
install: https://github.com/chirag127/x-mass-unfollow-userscript/raw/main/x-mass-unfollow-userscript.user.js
version: "1.0.0"
tags: [userscript, x, twitter, unfollow, bulk]
timestamp: 2026-11-09T00:00:00Z
---

# X Mass Unfollow

Lists everyone you follow, builds a dry-run queue, applies a whitelist and skip rules, then unfollows in bulk through X's own `friendships/destroy` endpoint.

## Method

Enumeration uses `friends/list` so each row already carries `protected` and `followed_by`; the unfollow is a single `friendships/destroy` POST. Auth is the page's own `ct0` cookie plus the web-client bearer.

Endpoints:

- `GET /i/api/1.1/friends/list.json?user_id=&count=200&cursor=` - paginated following list, gives `protected` and `followed_by`.
- `POST /i/api/1.1/friendships/destroy.json` with form body `user_id=` - the unfollow.
- `GET /i/api/1.1/users/show.json?screen_name=` - only to resolve your own id when `__INITIAL_STATE__.session.user_id` is missing.

## Limitations

- Protected accounts can be unfollowed, but they must approve you again - they are skipped by default.
- Hard cap of 1000 per run; the queue is built from `friends/list` pages of 200.
- Legacy v1.1 endpoints. A 429 is retried once after ~2.5 s, then reported as failed.
- There is no undo. Re-following is manual and a protected account must re-approve.

## Risk

Unfollowing is immediate and irreversible from the script's side. Scan, read the queue, and keep a whitelist of accounts you care about before pressing the confirm button.

## Install

Read the shared [install guide](https://github.com/chirag127/userscript-install-guide) once, then install the raw file above.
