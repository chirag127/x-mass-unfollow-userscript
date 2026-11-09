# X Mass Unfollow

Bulk-unfollow on X with a reviewable queue, whitelist and protected-account skip rule.

## What it does

Lists everyone you follow, builds a dry-run queue, applies a whitelist and skip rules, then unfollows in bulk through X's own `friendships/destroy` endpoint.

## Install

Read the shared **[userscript install guide](https://github.com/chirag127/userscript-install-guide)** once (ScriptCat / Tampermonkey setup), then install:

**[Install x-mass-unfollow-userscript.user.js](https://github.com/chirag127/x-mass-unfollow-userscript/raw/main/x-mass-unfollow-userscript.user.js)**

## Use

1. Open x.com signed in and press **Alt+Shift+U** (or reload; the panel is on the top right).
2. Set the cap, the whitelist and whether protected / mutual accounts are held back.
3. Press **Scan following** - this is the dry run. Every row shows why it is held back.
4. Untick or tick rows to override, then press **Unfollow N** once to confirm.
5. Watch per-row status and the log; **Pause** / **Stop** work mid-run.

Everything runs in a floating panel: drag it by the header, resize from the corner, collapse it to a chip. The dry run always comes first; exactly one confirm starts the work.

## Limits

- Protected accounts can be unfollowed, but they must approve you again - they are skipped by default.
- Hard cap of 1000 per run; the queue is built from `friends/list` pages of 200.
- Legacy v1.1 endpoints. A 429 is retried once after ~2.5 s, then reported as failed.
- There is no undo. Re-following is manual and a protected account must re-approve.

## Risk note

Unfollowing is immediate and irreversible from the script's side. Scan, read the queue, and keep a whitelist of accounts you care about before pressing the confirm button.

The script acts with your own signed-in session against your own account. It is not an anti-bot bypass - it uses the same endpoints the site's own page uses.

## Documentation

- [AGENTS.md](AGENTS.md) - implementation notes and test steps
- [okf/](../../../../../docs/okf/index.md) - knowledge bundle for humans and agents

## License

[MIT](LICENSE) (c) 2026 chirag127

<!-- docs-single-source -->
## 📚 Documentation

Documentation for this repository lives in the umbrella workspace, in exactly **one** place:

| What | Where |
|------|-------|
| This script's note | [`docs/okf/scripts/x-mass-unfollow-userscript.md`](../../../../../docs/okf/scripts/x-mass-unfollow-userscript.md) |
| All notes, catalogued | [`docs/okf/index.md`](../../../../../docs/okf/index.md) |
| Shared knowledge | [`docs/okf/concepts/`](../../../../../docs/okf/concepts/) |

It is **not** copied into this repository. Nothing in this workspace is duplicated: one
document, one file. Verify with `node c:\ws\scripts\check-okf.mjs`.
