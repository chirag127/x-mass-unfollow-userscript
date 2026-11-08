// ==UserScript==
// @name         X Mass Unfollow
// @namespace    https://github.com/chirag127
// @version      1.0.0
// @description  Bulk-unfollow accounts on X from a reviewable dry-run queue: whitelist, protected/mutual skip rules, hard cap, 3 parallel workers against friendships/destroy.
// @author       chirag127
// @license      MIT
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://x.com/favicon.ico
// @homepageURL  https://github.com/chirag127/x-mass-unfollow-userscript
// @supportURL   https://github.com/chirag127/x-mass-unfollow-userscript/issues
// @downloadURL  https://github.com/chirag127/x-mass-unfollow-userscript/raw/main/x-mass-unfollow-userscript.user.js
// @updateURL    https://github.com/chirag127/x-mass-unfollow-userscript/raw/main/x-mass-unfollow-userscript.user.js
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const ORIGIN = location.hostname.endsWith("twitter.com") ? "https://twitter.com" : "https://x.com";
  const FALLBACK_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const SET_KEY = "xmu.settings.v1";
  const HARD_CAP = 1000;

  const defaults = { cap: 100, skipProtected: true, skipMutual: true, concurrency: 3, whitelist: "" };
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } };
  const settings = Object.assign({}, defaults, readJSON(SET_KEY));
  const saveSettings = () => localStorage.setItem(SET_KEY, JSON.stringify(settings));

  let bearerCache = null;
  function bearer() {
    if (bearerCache) return bearerCache;
    const s = window.__INITIAL_STATE__;
    const found = s && (s.session && (s.session.bearerToken || s.session.bearer_token));
    const scanned = (document.documentElement.innerHTML.match(/Bearer (AAAA[A-Za-z0-9%._-]{40,})/) || [])[1];
    bearerCache = found || scanned || FALLBACK_BEARER;
    return bearerCache;
  }
  const ct0 = () => (document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/) || [])[1] || "";

  async function api(path, opts) {
    const token = ct0();
    if (!token) throw new Error("no ct0 cookie - sign in to X first");
    const o = opts || {};
    const headers = {
      authorization: "Bearer " + bearer(),
      "x-csrf-token": token,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
    };
    let body;
    if (o.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(o.form).toString();
    }
    const r = await fetch(ORIGIN + path, {
      method: o.method || "GET",
      headers: headers,
      body: body,
      credentials: "include",
    });
    if (r.status === 429) throw new Error("rate limited (429)");
    if (!r.ok) throw new Error((o.method || "GET") + " " + path.split("?")[0] + " -> " + r.status);
    return r.json().catch(() => ({}));
  }

  async function ownUserId() {
    const s = window.__INITIAL_STATE__;
    if (s && s.session && s.session.user_id) return s.session.user_id;
    const link = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const handle = link && (link.getAttribute("href") || "").replace(/^\//, "").split(/[/?]/)[0];
    if (!handle) throw new Error("cannot read your user id - open x.com signed in and retry");
    const me = await api("/i/api/1.1/users/show.json?screen_name=" + encodeURIComponent(handle));
    return me.id_str;
  }

  async function listFollowing(onPage) {
    const uid = await ownUserId();
    let cursor = "-1";
    const out = [];
    for (let guard = 0; guard < 100; guard++) {
      const q = "/i/api/1.1/friends/list.json?user_id=" + uid +
        "&count=200&skip_status=1&include_user_entities=0&cursor=" + encodeURIComponent(cursor);
      const j = await api(q);
      const users = j.users || [];
      for (const u of users) {
        out.push({
          id: u.id_str,
          handle: u.screen_name,
          name: u.name || "",
          prot: !!u.protected,
          mutual: !!u.followed_by,
        });
      }
      if (onPage) onPage(out.length);
      const next = j.next_cursor_str;
      if (!users.length || !next || next === "0") break;
      cursor = next;
    }
    return out;
  }

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = () => sleep(150 + Math.random() * 250);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const isTyping = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };

  // ---------- UI ----------
  const P = "xu-";
  const CSS = [
    ".xu{position:fixed;z-index:2147483000;top:70px;right:20px;width:540px;height:540px;background:#181818;color:#e8e8e8;",
    "border:1px solid #303030;border-radius:10px;box-shadow:0 14px 44px rgba(0,0,0,.65);display:flex;flex-direction:column;",
    "font:13px/1.45 Roboto,'Segoe UI',system-ui,sans-serif;overflow:hidden;resize:both;min-width:380px;min-height:300px}",
    ".xu *{box-sizing:border-box}",
    ".xu-head{display:flex;align-items:center;gap:8px;padding:9px 11px;background:#202020;border-bottom:1px solid #303030;cursor:move;user-select:none}",
    ".xu-title{font-weight:600;font-size:13px;letter-spacing:.2px;flex:1}",
    ".xu-badge{font-size:10px;color:#9a9a9a;border:1px solid #3a3a3a;border-radius:4px;padding:1px 5px}",
    ".xu-btn{background:#2a2a2a;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer}",
    ".xu-btn:hover{background:#333}.xu-btn:disabled{opacity:.45;cursor:default}",
    ".xu-btn.primary{background:#065fd4;border-color:#065fd4}.xu-btn.primary:hover{background:#0a72f5}",
    ".xu-btn.danger{background:#5c1d1d;border-color:#7a2a2a}.xu-btn.danger:hover{background:#7a2a2a}",
    ".xu-x{background:none;border:0;color:#9a9a9a;font-size:16px;line-height:1;cursor:pointer;padding:0 2px}",
    ".xu-body{flex:1;display:flex;flex-direction:column;min-height:0}",
    ".xu-bar{display:flex;gap:6px;padding:8px 11px;border-bottom:1px solid #262626;flex-wrap:wrap}",
    ".xu-stat{font-size:11px;color:#9a9a9a;padding:0 11px 6px}",
    ".xu-prog{height:4px;background:#262626}.xu-prog>i{display:block;height:100%;width:0;background:#065fd4;transition:width .18s}",
    ".xu-wrap{flex:1;overflow:auto;min-height:60px;border-bottom:1px solid #262626}",
    ".xu-table{width:100%;border-collapse:collapse;font-size:12px}",
    ".xu-table th{position:sticky;top:0;background:#202020;color:#9a9a9a;font-weight:500;text-align:left;padding:5px 8px;border-bottom:1px solid #303030}",
    ".xu-table td{padding:4px 8px;border-bottom:1px solid #242424;vertical-align:top}",
    ".xu-table tr.off td{opacity:.42}",
    ".xu-h{font-weight:600}.xu-sub{color:#9a9a9a;font-size:11px}",
    ".xu-tag{font-size:10px;border-radius:4px;padding:0 4px;border:1px solid #3a3a3a;color:#9a9a9a}",
    ".xu-tag.warn{border-color:#7a5a1a;color:#d6a43a}",
    ".xu-st{font-size:11px;color:#9a9a9a}.xu-st.ok{color:#4caf7d}.xu-st.err{color:#e06c6c}.xu-st.skip{color:#d6a43a}",
    ".xu-log{height:104px;overflow:auto;font:11px/1.5 ui-monospace,Consolas,monospace;padding:6px 11px;background:#141414;color:#9a9a9a;white-space:pre-wrap;word-break:break-word}",
    ".xu-set{padding:0 11px 9px;font-size:11px;color:#bdbdbd}.xu-set summary{cursor:pointer;padding:5px 0;color:#9a9a9a}",
    ".xu-field{display:flex;align-items:center;gap:6px;margin:5px 0}",
    ".xu-field input[type=number],.xu-field input[type=text]{background:#101010;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:5px;padding:3px 6px;font:inherit;width:74px}",
    ".xu-field textarea{background:#101010;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:5px;padding:4px 6px;font:inherit;width:100%;height:44px;resize:vertical}",
    ".xu-chip{position:fixed;z-index:2147483000;right:20px;bottom:20px;background:#065fd4;color:#fff;border:0;border-radius:18px;padding:7px 14px;font:600 12px Roboto,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.5);display:none}",
    ".xu-hide{display:none!important}",
  ].join("");

  function makeUI() {
    const style = h("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const panel = h("div", "xu " + P + "panel");
    const head = h("div", "xu-head");
    const title = h("div", "xu-title", "X Mass Unfollow");
    const badge = h("span", "xu-badge", "v1.0.0");
    const collapse = h("button", "xu-x", "\u2013");
    collapse.title = "Collapse to chip";
    const close = h("button", "xu-x", "\u00d7");
    close.title = "Hide (reload to restore)";
    head.append(title, badge, collapse, close);

    const bar = h("div", "xu-bar");
    const btnScan = h("button", "xu-btn primary", "Scan following");
    const btnRun = h("button", "xu-btn", "Unfollow 0");
    const btnPause = h("button", "xu-btn", "Pause");
    const btnStop = h("button", "xu-btn danger", "Stop");
    const btnAll = h("button", "xu-btn", "All");
    const btnNone = h("button", "xu-btn", "None");
    btnRun.disabled = btnPause.disabled = btnStop.disabled = btnAll.disabled = btnNone.disabled = true;
    bar.append(btnScan, btnRun, btnPause, btnStop, btnAll, btnNone);

    const stat = h("div", "xu-stat", "Idle. Scan your following list first - nothing is unfollowed until you confirm.");
    const prog = h("div", "xu-prog");
    const progFill = h("i");
    prog.appendChild(progFill);

    const wrap = h("div", "xu-wrap");
    const table = h("table", "xu-table");
    const thead = h("thead");
    const hr = h("tr");
    ["", "Account", "Flags", "Status"].forEach((label, i) => {
      const th = h("th", null, label);
      if (i === 0) th.style.width = "26px";
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = h("tbody");
    table.append(thead, tbody);
    wrap.appendChild(table);

    const logBox = h("div", "xu-log");

    const setBox = h("details", "xu-set");
    setBox.appendChild(h("summary", null, "Settings"));
    const capField = h("label", "xu-field");
    const capIn = h("input");
    capIn.type = "number";
    capIn.min = "1";
    capIn.max = String(HARD_CAP);
    capIn.value = String(settings.cap);
    capField.append(h("span", null, "Max unfollows per run"), capIn);
    const conField = h("label", "xu-field");
    const conIn = h("input");
    conIn.type = "number";
    conIn.min = "1";
    conIn.max = "5";
    conIn.value = String(settings.concurrency);
    conField.append(h("span", null, "Parallel workers"), conIn);
    const protField = h("label", "xu-field");
    const protIn = h("input");
    protIn.type = "checkbox";
    protIn.checked = settings.skipProtected;
    protField.append(protIn, h("span", null, "Skip protected accounts (need re-approval)"));
    const mutField = h("label", "xu-field");
    const mutIn = h("input");
    mutIn.type = "checkbox";
    mutIn.checked = settings.skipMutual;
    mutField.append(mutIn, h("span", null, "Skip accounts that follow you back"));
    const wlField = h("label", "xu-field");
    wlField.style.display = "block";
    wlField.append(h("span", null, "Whitelist - handles, comma or newline separated"));
    const wlIn = h("textarea");
    wlIn.value = settings.whitelist;
    wlField.appendChild(wlIn);
    setBox.append(capField, conField, protField, mutField, wlField);

    const body = h("div", "xu-body");
    body.append(bar, stat, prog, wrap, setBox, logBox);
    panel.append(head, body);

    const chip = h("button", "xu-chip " + P + "chip", "\u2191 Mass Unfollow");

    document.body.append(panel, chip);

    const drag = (ev) => {
      if (ev.target.closest("button")) return;
      const r = panel.getBoundingClientRect();
      const dx = ev.clientX - r.left;
      const dy = ev.clientY - r.top;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = r.left + "px";
      panel.style.top = r.top + "px";
      const move = (e) => {
        panel.style.left = Math.max(0, e.clientX - dx) + "px";
        panel.style.top = Math.max(0, e.clientY - dy) + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    head.addEventListener("pointerdown", drag);
    collapse.addEventListener("click", () => {
      panel.classList.add("xu-hide");
      chip.style.display = "block";
    });
    chip.addEventListener("click", () => {
      chip.style.display = "none";
      panel.classList.remove("xu-hide");
    });
    close.addEventListener("click", () => {
      panel.remove();
      chip.remove();
    });

    const sync = () => {
      settings.cap = Math.max(1, Math.min(HARD_CAP, Number(capIn.value) || defaults.cap));
      settings.concurrency = Math.max(1, Math.min(5, Number(conIn.value) || 3));
      settings.skipProtected = protIn.checked;
      settings.skipMutual = mutIn.checked;
      settings.whitelist = wlIn.value;
      saveSettings();
    };
    [capIn, conIn, protIn, mutIn, wlIn].forEach((n) => n.addEventListener("change", sync));

    const ui = {
      panel: panel,
      chip: chip,
      btnScan: btnScan,
      btnRun: btnRun,
      btnPause: btnPause,
      btnStop: btnStop,
      btnAll: btnAll,
      btnNone: btnNone,
      progFill: progFill,
      tbody: tbody,
      log: (msg, cls) => {
        const line = h("div", cls || null, "[" + new Date().toLocaleTimeString() + "] " + msg);
        logBox.appendChild(line);
        while (logBox.childElementCount > 300) logBox.firstChild.remove();
        logBox.scrollTop = logBox.scrollHeight;
      },
      stat: (text) => { stat.textContent = text; },
      progress: (done, total) => { progFill.style.width = (total ? (done / total) * 100 : 0) + "%"; },
      clearRows: () => { tbody.textContent = ""; },
      row: (item) => {
        const tr = h("tr");
        const td0 = h("td");
        const cb = h("input");
        cb.type = "checkbox";
        cb.checked = !!item.sel;
        cb.dataset.id = item.id;
        td0.appendChild(cb);
        const td1 = h("td");
        const nm = h("div", "xu-h", item.name || item.handle);
        const hd = h("div", "xu-sub", "@" + item.handle);
        td1.append(nm, hd);
        const td2 = h("td");
        if (item.prot) td2.appendChild(h("span", "xu-tag warn", "protected"));
        if (item.mutual) td2.appendChild(h("span", "xu-tag", " mutual"));
        if (item.why && item.why !== "protected" && item.why !== "mutual") {
          td2.appendChild(h("span", "xu-tag", " " + item.why));
        }
        const td3 = h("td");
        const st = h("span", "xu-st", "queued");
        td3.appendChild(st);
        tr.append(td0, td1, td2, td3);
        tbody.appendChild(tr);
        item.cb = cb;
        item.tr = tr;
        item.st = st;
        cb.addEventListener("change", () => {
          item.sel = cb.checked;
          tr.classList.toggle("off", !cb.checked);
          ui.onSelChange && ui.onSelChange();
        });
        tr.classList.toggle("off", !item.sel);
        return item;
      },
      setStatus: (item, text, cls) => {
        item.st.textContent = text;
        item.st.className = "xu-st" + (cls ? " " + cls : "");
      },
    };
    return ui;
  }

  // ---------- state ----------
  let ui = null;
  let items = [];
  let phase = "idle"; // idle | ready | running | done
  const run = { stop: false, paused: false, done: 0, ok: 0, fail: 0, skip: 0 };

  const whitelist = () => new Set(
    settings.whitelist.split(/[\s,]+/).map((s) => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean)
  );

  function selected() { return items.filter((i) => i.sel); }

  function refreshCounts() {
    if (!ui) return;
    const n = selected().length;
    ui.btnRun.textContent = phase === "running" ? "Running…" : "Unfollow " + n;
    ui.btnRun.disabled = phase !== "ready" || n === 0;
    ui.stat(
      phase === "running"
        ? run.done + " / " + items.length + " processed - " + run.ok + " unfollowed, " + run.fail + " failed, " + run.skip + " skipped"
        : n + " of " + items.length + " selected. Cap " + settings.cap + ". Confirm with the button."
    );
  }

  async function scan() {
    phase = "idle";
    if (ui) {
      ui.clearRows();
      ui.log("Scanning following list via friends/list…");
      ui.stat("Scanning…");
      ui.btnScan.disabled = true;
      ui.btnRun.disabled = true;
      ui.btnAll.disabled = ui.btnNone.disabled = true;
    }
    items = [];
    const white = whitelist();
    try {
      const list = await listFollowing((n) => ui && ui.stat("Fetched " + n + " accounts…"));
      if (!list.length) {
        ui && ui.log("Following list is empty (or the endpoint refused).", "xu-st skip");
        ui && ui.stat("Nothing to unfollow.");
        return;
      }
      for (const u of list) {
        if (white.has(u.handle.toLowerCase())) { u.sel = false; u.why = "whitelist"; }
        else if (settings.skipProtected && u.prot) { u.sel = false; u.why = "protected"; }
        else if (settings.skipMutual && u.mutual) { u.sel = false; u.why = "mutual"; }
        else u.sel = true;
        items.push(u);
      }
      // Cap: keep the first N selected, deselect the rest so the preview is exact.
      let kept = 0;
      for (const it of items) {
        if (!it.sel) continue;
        if (kept >= settings.cap) { it.sel = false; it.why = "over cap"; } else kept++;
      }
      ui && ui.clearRows();
      items.forEach((it) => ui && ui.row(it));
      const skipped = items.filter((i) => i.why).length;
      ui && ui.log("Found " + items.length + " following, " + kept + " selected, " + skipped + " held back.");
      if (skipped) ui && ui.log("Hold-backs: whitelist / protected / mutual / over cap. Toggle any row to override.");
      phase = "ready";
      ui && (ui.btnAll.disabled = ui.btnNone.disabled = false);
    } catch (e) {
      ui && ui.log("Scan failed: " + e.message, "xu-st err");
      ui && ui.stat("Scan failed - see log.");
    } finally {
      if (ui) ui.btnScan.disabled = false;
      refreshCounts();
    }
  }

  async function unfollow(item) {
    try {
      await api("/i/api/1.1/friendships/destroy.json", { method: "POST", form: { user_id: item.id } });
      run.ok++;
      ui.setStatus(item, "unfollowed", "ok");
    } catch (e) {
      if (/429/.test(e.message)) {
        await sleep(2500);
        try {
          await api("/i/api/1.1/friendships/destroy.json", { method: "POST", form: { user_id: item.id } });
          run.ok++;
          ui.setStatus(item, "unfollowed (retry)", "ok");
          return;
        } catch (e2) {
          run.fail++;
          ui.setStatus(item, "failed: " + e2.message, "err");
          ui.log("@" + item.handle + " failed twice: " + e2.message, "xu-st err");
          return;
        }
      }
      run.fail++;
      ui.setStatus(item, "failed: " + e.message, "err");
      ui.log("@" + item.handle + " failed: " + e.message, "xu-st err");
    }
  }

  async function runQueue(queue) {
    let i = 0;
    const workers = Array.from({ length: Math.min(settings.concurrency, queue.length) }, async () => {
      while (i < queue.length) {
        if (run.stop) return;
        while (run.paused) await sleep(120);
        const item = queue[i++];
        if (!item) return;
        ui.setStatus(item, "working…");
        await unfollow(item);
        run.done++;
        ui.progress(run.done, queue.length);
        refreshCounts();
        if (!run.stop) await jitter();
      }
    });
    await Promise.all(workers);
  }

  async function start() {
    if (phase !== "ready") return;
    const queue = selected();
    if (!queue.length) return;
    if (!ct0()) { ui.log("No ct0 cookie - sign in to X first.", "xu-st err"); return; }
    phase = "running";
    run.stop = false;
    run.paused = false;
    run.done = run.ok = run.fail = run.skip = 0;
    ui.btnScan.disabled = true;
    ui.btnPause.disabled = ui.btnStop.disabled = false;
    ui.btnPause.textContent = "Pause";
    ui.progress(0, queue.length);
    ui.log("Starting: " + queue.length + " unfollows, " + settings.concurrency + " workers.");
    await runQueue(queue);
    phase = "done";
    ui.btnScan.disabled = false;
    ui.btnPause.disabled = ui.btnStop.disabled = true;
    ui.btnRun.disabled = true;
    refreshCounts();
    ui.log(
      (run.stop ? "Stopped. " : "Finished. ") + run.ok + " unfollowed, " + run.fail + " failed, " + run.done + " of " + queue.length + " processed.",
      run.fail ? "xu-st err" : "xu-st ok"
    );
    ui.stat("Done. Rescan to refresh the list.");
  }

  function toggleAll(on) {
    if (phase === "running") return;
    let kept = 0;
    for (const it of items) {
      if (on) {
        if (kept >= settings.cap) { it.sel = false; it.why = it.why || "over cap"; }
        else { it.sel = true; it.why = ""; kept++; }
      } else it.sel = false;
      it.cb.checked = it.sel;
      it.tr.classList.toggle("off", !it.sel);
    }
    refreshCounts();
  }

  function mount() {
    if (document.querySelector(".xu-panel")) return;
    if (!document.body) return;
    ui = makeUI();
    ui.onSelChange = refreshCounts;
    ui.btnScan.addEventListener("click", scan);
    ui.btnRun.addEventListener("click", start);
    ui.btnPause.addEventListener("click", () => {
      run.paused = !run.paused;
      ui.btnPause.textContent = run.paused ? "Resume" : "Pause";
      ui.log(run.paused ? "Paused." : "Resumed.");
    });
    ui.btnStop.addEventListener("click", () => {
      run.stop = true;
      run.paused = false;
      ui.log("Stop requested - workers finish their current request.");
    });
    ui.btnAll.addEventListener("click", () => toggleAll(true));
    ui.btnNone.addEventListener("click", () => toggleAll(false));
    ui.log("Ready. Scan builds a queue; nothing is sent until you press Unfollow.");
  }

  // Re-mount after X's SPA navigations, and give the panel its context back.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (!document.querySelector(".xu-panel")) mount();
    if (phase === "idle") {
      items = [];
      ui && ui.clearRows();
      ui && ui.stat("Route changed - scan again.");
    }
  }, 800);

  // Shortcut: Alt+Shift+U toggles the panel, but never while typing.
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || !e.shiftKey || e.key.toLowerCase() !== "u" || isTyping()) return;
    e.preventDefault();
    if (!ui) return mount();
    const hidden = ui.panel.classList.contains("xu-hide");
    if (hidden) ui.chip.click(); else ui.panel.classList.toggle("xu-hide");
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
