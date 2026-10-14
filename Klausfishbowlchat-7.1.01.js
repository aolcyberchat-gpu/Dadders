// ==UserScript==
// @name         CyTube Dadders — Klaus Fish Bowl Chat
// @namespace    https://cytu.be/r/Dadders
// @version      7.1.01
// @match        https://cytu.be/r/Dadders*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ═══════════════════════════════════════════════════════════════════════════════
//  Klaus Fish Bowl Chat — v7.1.01   (UX/UI overhaul)
//  GitHub : https://github.com/aolcyberchat-gpu/Dadders
//  jsDelivr: https://cdn.jsdelivr.net/gh/aolcyberchat-gpu/Dadders@main/Klausfishbowlchat-7.1.01.js
//
//  7.1.01: Klaus's Logs moved into the top bar as a 🪵 dropdown (under the nav,
//          right side). Closes on outside tap / Esc / ✕. Header URLs corrected.
//
//  LAYOUT (top → bottom):
//    [boxed menu emoji] ........ [Welcome, name]  [Log out]     ← top bar
//    water strip with boats                                     ← game lane
//    VIDEO fills everything between the water and the chat bar
//      · chat floats over the video in one of 3 modes
//    chat bar: online users (+ sha256 badge) / emoji | input | send
//    tool row: 📊 new poll   [💬 chat log] [🫧 bubbles] [🙈 off]
//
//  CHAT MODES (saved per browser):
//    💬 normal  — CyTube's real chat log as a translucent panel over the video
//                 (scroll back to catch up on past messages)
//    🫧 bubbles — messages float up as bubbles (message text only, no username)
//    🙈 off     — video + chat bar + boats + nav only
//
//  IDENTITY: every username gets sha256(lowercased name). That one hash drives
//  the user's color (hue), boat position (fraction of screen width) and the
//  short badge in the chat bar, so it is identical on every client.
//
//  ALSO IN THIS VERSION (fixes from the v7.0.05 review):
//    · bubble catch test uses the bubble CENTER, not its left edge
//    · boat X is a fraction of screen width → same relative spot on any screen
//    · boats of users who left are removed from the water
//    · one requestAnimationFrame loop instead of one setInterval per bubble
//    · bubbles keep emotes (message nodes are cloned, not flattened to text)
//    · global touchmove block removed (it broke scrolling the chat log)
//    · history already in the chat when you load does NOT spawn bubbles
//
//  Tip: change MENU_EMOJI below to swap the menu icon (🍔 🐠 🐟 🥤 🍫 …).
// ═══════════════════════════════════════════════════════════════════════════════

const KLAUS_DEBUG = true;
const MENU_EMOJI  = "🍔";
const BG_IMAGE    = "https://i.ibb.co/TDKkr0rx/Klaus-Fish-Bowl-Chats.webp";

(function () {
  "use strict";

  // ───────────────────────────────────────────────────────────────────────────
  //  SHA-256 (sync, no dependencies) — used for deterministic per-user identity
  // ───────────────────────────────────────────────────────────────────────────
  const sha256hex = (function () {
    const K = [], H0 = [];
    for (let c = 2, n = 0; n < 64; c++) {
      let prime = true;
      for (let i = 2; i * i <= c; i++) { if (c % i === 0) { prime = false; break; } }
      if (!prime) continue;
      if (n < 8) H0[n] = (Math.pow(c, 0.5) * 4294967296) | 0;
      K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
    }
    return function (str) {
      const b = new TextEncoder().encode(str), l = b.length;
      const nBlocks = ((l + 8) >> 6) + 1;
      const w = new Uint32Array(nBlocks * 16);
      for (let i = 0; i < l; i++) w[i >> 2] |= b[i] << (24 - (i & 3) * 8);
      w[l >> 2] |= 0x80 << (24 - (l & 3) * 8);
      w[nBlocks * 16 - 1] = l * 8;
      const H = H0.slice(), W = new Array(64);
      for (let blk = 0; blk < nBlocks; blk++) {
        for (let t = 0; t < 16; t++) W[t] = w[blk * 16 + t];
        for (let t = 16; t < 64; t++) {
          const a = W[t - 15], c2 = W[t - 2];
          const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
          const s1 = ((c2 >>> 17) | (c2 << 15)) ^ ((c2 >>> 19) | (c2 << 13)) ^ (c2 >>> 10);
          W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }
        let a = H[0], b2 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let t = 0; t < 64; t++) {
          const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
          const ch = (e & f) ^ (~e & g);
          const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
          const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
          const maj = (a & b2) ^ (a & c) ^ (b2 & c);
          const t2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b2) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      return H.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
    };
  })();

  const idCache = {};
  function ident(name) {
    const key = String(name).toLowerCase();
    if (idCache[key]) return idCache[key];
    const hex  = sha256hex(key);
    const hue  = parseInt(hex.slice(0, 4), 16) % 360;
    const frac = parseInt(hex.slice(8, 16), 16) / 4294967295;
    return (idCache[key] = {
      hex: hex,
      short: hex.slice(0, 6),
      hue: hue,
      frac: frac,
      color:    "hsl(" + hue + ",85%,68%)",
      bubbleBg: "hsla(" + hue + ",65%,30%,0.82)",
      hullBg:   "hsla(" + hue + ",70%,32%,0.88)",
    });
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ───────────────────────────────────────────────────────────────────────────
  //  GAME STATE
  // ───────────────────────────────────────────────────────────────────────────
  const boatScores = {};   // { username: number }  (local per session)
  const boatEls    = {};   // { username: HTMLElement }  (only users currently online)

  function getPower(score) { return score >= 15 ? 2 : score >= 7 ? 1 : 0; }
  function getCatchRadius(score) { const p = getPower(score); return p === 2 ? 90 : p === 1 ? 65 : 45; }
  function getInterceptY(score) { return getPower(score) === 2 ? 30 : 0; }

  // ───────────────────────────────────────────────────────────────────────────
  //  KLAUS'S LOGS  (kept from 7.0.05 — on-screen debug panel for mobile)
  // ───────────────────────────────────────────────────────────────────────────
  let logPanel  = null;
  let logToggleEl = null;
  let logBody   = null;
  let logLines  = [];
  let statusMsg = "idle";
  let bubblesSpawned = 0;
  let msgsProcessed  = 0;
  let currentMode    = "bubbles";

  function buildLogUI() {
    if (!KLAUS_DEBUG) return;

    const logToggle = document.createElement("button");
    logToggleEl = logToggle;
    logToggle.id = "kl-log-btn";
    logToggle.textContent = "🪵";
    logToggle.setAttribute("aria-label", "Klaus's Logs");
    logToggle.setAttribute("data-tip", "Klaus's Logs: debug log and status");
    // Fallback look until setup() moves this button into the top bar
    logToggle.style.cssText = [
      "position:fixed","top:4px","right:8px","z-index:99999",
      "background:#000","color:#fff","border:1.5px solid #00ff88",
      "border-radius:10px","padding:4px 8px","cursor:pointer","font-size:16px",
    ].join(";");
    logToggle.addEventListener("click", e => {
      e.stopPropagation();
      const open = logPanel.style.display === "none";
      logPanel.style.display = open ? "flex" : "none";
      logToggle.classList.toggle("on", open);
      if (open) {
        document.documentElement.classList.remove("kl-menu-open");
        const mb = document.getElementById("kl-menu-btn");
        if (mb) mb.classList.remove("on");
      }
    });
    document.body.appendChild(logToggle);

    logPanel = document.createElement("div");
    logPanel.id = "kl-log-panel";
    logPanel.style.cssText = [
      "display:none","position:fixed","top:46px","right:8px",
      "width:320px","max-width:calc(100vw - 16px)","max-height:min(60vh,380px)",
      "background:rgba(0,0,0,0.92)","color:#00ff88",
      "border:1.5px solid #00ff88","border-radius:10px",
      "z-index:99999","flex-direction:column","font:10px monospace","overflow:hidden",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = [
      "display:flex","align-items:center","gap:5px","padding:5px 8px",
      "background:rgba(0,255,100,0.08)",
      "border-bottom:1px solid rgba(0,255,100,0.2)","flex-shrink:0",
    ].join(";");
    const title = document.createElement("span");
    title.textContent = "🪵 Klaus's Logs";
    title.style.cssText = "font-weight:700;font-size:11px;color:#00ff88;flex:1;";
    header.appendChild(title);

    function makeBtn(label, color, onClick) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = [
        "background:transparent","border:1px solid "+color,"color:"+color,
        "border-radius:10px","padding:2px 7px","font:700 9px monospace",
        "cursor:pointer","flex-shrink:0",
      ].join(";");
      b.addEventListener("click", onClick);
      return b;
    }

    const copyBtn  = makeBtn("Copy",   "#a8ff78", () => {
      const text = logLines.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => { copyBtn.textContent = "Copied!"; setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500); })
          .catch(() => fallbackCopy(text, copyBtn));
      } else { fallbackCopy(text, copyBtn); }
    });
    const clearBtn = makeBtn("Clear",  "#ffcc44", () => { logLines = []; logBody.innerHTML = ""; dbg("log cleared"); });
    const closeBtn = makeBtn("✕",      "#ff6b6b", () => closeLogs());
    const statBtn  = makeBtn("Status", "#7dd8ff", showStatusOverlay);

    header.appendChild(statBtn);
    header.appendChild(copyBtn);
    header.appendChild(clearBtn);
    header.appendChild(closeBtn);
    logPanel.appendChild(header);

    logBody = document.createElement("div");
    logBody.style.cssText = "flex:1;overflow-y:auto;padding:5px 7px;";
    logPanel.appendChild(logBody);
    document.body.appendChild(logPanel);
  }

  function closeLogs() {
    if (logPanel) logPanel.style.display = "none";
    if (logToggleEl) logToggleEl.classList.remove("on");
  }

  function fallbackCopy(text, btn) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); btn.textContent = "Copied!"; }
    catch (e) { btn.textContent = "Failed"; }
    setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    document.body.removeChild(ta);
  }

  function showStatusOverlay() {
    const existing = document.getElementById("kl-status-overlay");
    if (existing) existing.remove();
    const ov = document.createElement("div");
    ov.id = "kl-status-overlay";
    ov.style.cssText = [
      "position:fixed","top:46px","right:8px","width:320px",
      "max-width:calc(100vw - 16px)",
      "background:rgba(0,10,20,0.97)","border:1.5px solid #7dd8ff",
      "border-radius:10px","padding:12px 14px","z-index:999999",
      "font:11px monospace","color:#e8f4ff",
    ].join(";");

    const scoreEntries = Object.entries(boatScores)
      .sort((a, b) => b[1] - a[1])
      .map(([n, s]) => n + ": " + s + " (" + ["🚣", "⚡", "🤿"][getPower(s)] + ")")
      .join(" | ") || "none yet";

    const rows = [
      ["Version",       "7.1.01"],
      ["Status",        statusMsg],
      ["Chat mode",     currentMode],
      ["Socket",        typeof window.socket !== "undefined" ? "connected" : "NOT FOUND"],
      ["jQuery",        typeof $ !== "undefined" ? $.fn.jquery : "NOT FOUND"],
      ["CHATTHROTTLE",  typeof CHATTHROTTLE !== "undefined" ? String(CHATTHROTTLE) : "undefined"],
      ["Bubbles fired", String(bubblesSpawned)],
      ["Msgs seen",     String(msgsProcessed)],
      ["Users online",  String(document.querySelectorAll("#userlist .userlist_item").length)],
      ["Boats",         String(Object.keys(boatEls).length)],
      ["Scores",        scoreEntries.substring(0, 60)],
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;margin-bottom:4px;border-bottom:1px solid rgba(100,180,255,0.1);padding-bottom:3px;gap:8px";
      const kEl = document.createElement("span"); kEl.style.cssText = "color:#7dd8ff;flex-shrink:0"; kEl.textContent = k;
      const vEl = document.createElement("span"); vEl.style.cssText = "color:" + (v.includes("NOT") ? "#ff6b6b" : "#a8ff78") + ";text-align:right;word-break:break-all"; vEl.textContent = v;
      row.appendChild(kEl); row.appendChild(vEl); ov.appendChild(row);
    });
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "✕ Close Status";
    dismissBtn.style.cssText = [
      "margin-top:8px","width:100%","background:rgba(0,130,255,0.15)",
      "border:1px solid rgba(0,180,255,0.35)","color:#7dd8ff","border-radius:8px",
      "padding:4px","font:700 10px monospace","cursor:pointer",
    ].join(";");
    dismissBtn.addEventListener("click", () => ov.remove());
    ov.appendChild(dismissBtn);
    document.body.appendChild(ov);
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, 8000);
  }

  function dbg(msg) {
    if (!KLAUS_DEBUG) return;
    const ts   = new Date().toLocaleTimeString("en", { hour12: false });
    const full = ts + " " + msg;
    logLines.push(full);
    if (logLines.length > 300) logLines.shift();
    if (!logBody) return;
    const line = document.createElement("div");
    line.style.cssText = "border-bottom:1px solid rgba(0,255,100,0.1);padding:1px 0 2px;";
    line.textContent = full;
    logBody.insertBefore(line, logBody.firstChild);
    while (logBody.children.length > 200) logBody.lastChild.remove();
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  BOOT
  // ───────────────────────────────────────────────────────────────────────────
  buildLogUI();

  function init() {
    if (typeof $ === "undefined")             { setTimeout(init, 200); return; }
    if (!$("#messagebuffer").length)          { setTimeout(init, 300); return; }
    if (typeof window.socket === "undefined") { setTimeout(init, 300); return; }
    statusMsg = "running";
    dbg("v7.1.01 init OK");
    try { setup(); }
    catch (err) { statusMsg = "SETUP ERROR"; dbg("SETUP ERROR: " + (err && err.message)); console.error(err); }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  CSS
  // ───────────────────────────────────────────────────────────────────────────
  const CSS = `
    html.kl-on { --kl-top:94px; --kl-bottom:132px; }
    html.kl-on, html.kl-on body { overflow:hidden !important; height:100%; overscroll-behavior:none; }

    /* ── Original CyTube nav → dropdown panel under the menu button ── */
    html.kl-on nav.navbar, html.kl-on .navbar-fixed-top {
      position:fixed !important; top:46px !important; left:8px !important; right:auto !important;
      width:260px; max-width:calc(100vw - 16px); min-height:0 !important; margin:0 !important;
      display:none; z-index:1000;
      background:rgba(0,10,28,0.96) !important;
      border:1.5px solid rgba(125,216,255,0.5) !important; border-radius:12px !important;
      max-height:calc(100vh - 150px); overflow-y:auto;
    }
    html.kl-menu-open nav.navbar, html.kl-menu-open .navbar-fixed-top { display:block; }
    html.kl-on nav.navbar .navbar-header { display:none !important; }
    html.kl-on nav.navbar .container, html.kl-on nav.navbar .container-fluid { padding:0 !important; width:auto !important; margin:0 !important; }
    html.kl-on nav.navbar .navbar-collapse {
      display:block !important; height:auto !important; visibility:visible !important;
      padding:4px !important; border:0 !important; box-shadow:none !important;
    }
    html.kl-on nav.navbar .navbar-nav { float:none !important; margin:0 !important; }
    html.kl-on nav.navbar .navbar-nav > li { float:none !important; }
    html.kl-on nav.navbar .navbar-nav > li > a { color:#cfeaff !important; padding:9px 12px !important; border-radius:8px; }
    html.kl-on nav.navbar .navbar-nav > li > a:hover,
    html.kl-on nav.navbar .navbar-nav > li > a:focus { background:rgba(125,216,255,0.15) !important; }
    html.kl-on nav.navbar .dropdown-menu {
      position:static !important; float:none !important; width:auto !important;
      background:rgba(255,255,255,0.06) !important; border:0 !important; box-shadow:none !important;
    }

    /* ── Top bar ── */
    #kl-nav {
      position:fixed; top:0; left:0; right:0; height:42px;
      background:rgba(0,10,28,0.85);
      border-bottom:1px solid rgba(0,180,255,0.25);
      display:flex; align-items:center; gap:8px; padding:0 8px;
      color:#cfeaff; font:600 13px system-ui,sans-serif;
      z-index:900; user-select:none;
    }
    #kl-title { font-weight:700; color:#7dd8ff; white-space:nowrap; }
    #kl-nav-count { font-weight:400; font-size:12px; color:rgba(160,210,255,0.65); white-space:nowrap; }
    .kl-spacer { flex:1; min-width:0; }
    #kl-welcome { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
    #kl-uname { color:#ffe27a; }
    .kl-textbtn {
      background:rgba(0,20,50,0.6); color:#cfeaff; cursor:pointer;
      border:1.5px solid rgba(125,216,255,0.45); border-radius:10px;
      padding:5px 10px; font:600 12px system-ui,sans-serif; white-space:nowrap; flex-shrink:0;
    }
    @media (max-width:560px) { #kl-title { display:none; } }

    /* ── Boxed emoji buttons ── */
    .kl-ibtn {
      background:rgba(0,20,50,0.6); color:#fff; cursor:pointer;
      border:1.5px solid rgba(125,216,255,0.55); border-radius:10px;
      min-width:36px; height:36px; padding:0 6px; font-size:18px; line-height:1;
      display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .kl-ibtn:active, .kl-textbtn:active { background:rgba(0,150,255,0.35); }
    .kl-ibtn.on { background:rgba(0,150,255,0.38); border-color:#7dd8ff; box-shadow:0 0 0 2px rgba(125,216,255,0.25); }
    .kl-ibtn:focus-visible, .kl-textbtn:focus-visible, #kl-input:focus-visible { outline:2px solid #ffe27a; outline-offset:2px; }

    /* ── Tooltips (data-tip). Long-press on touch screens. ── */
    [data-tip] { position:relative; }
    [data-tip]::after {
      content:attr(data-tip); position:absolute; left:50%; bottom:calc(100% + 8px); transform:translateX(-50%);
      background:rgba(0,0,0,0.94); color:#ffe27a; border:1px solid rgba(255,226,122,0.5);
      border-radius:6px; padding:3px 8px; font:600 11px/1.3 system-ui,sans-serif;
      white-space:nowrap; opacity:0; pointer-events:none; transition:opacity .12s; z-index:100000;
      text-shadow:none; letter-spacing:0;
    }
    [data-tip].tip-down::after { bottom:auto; top:calc(100% + 8px); }
    [data-tip].tip-l::after { left:0; transform:none; }
    [data-tip].tip-r::after { left:auto; right:0; transform:none; }
    [data-tip]:focus-visible::after, [data-tip].kl-tip-show::after { opacity:1; }
    @media (hover:hover) { [data-tip]:hover::after { opacity:1; } }

    /* ── Video fills the screen between water strip and chat bar ── */
    html.kl-on #videowrap {
      position:fixed !important; top:var(--kl-top) !important; left:0 !important; right:0 !important;
      bottom:var(--kl-bottom) !important; width:auto !important; max-width:none !important;
      height:auto !important; margin:0 !important; padding:0 !important; float:none !important;
      z-index:1; background:#000;
    }
    html.kl-on #videowrap-header { display:none !important; }
    html.kl-on #videowrap .embed-responsive {
      position:absolute !important; top:0; left:0; width:100% !important;
      height:100% !important; padding:0 !important; margin:0 !important;
    }
    html.kl-on #videowrap iframe, html.kl-on #videowrap video, html.kl-on #videowrap .video-js,
    html.kl-on #videowrap embed, html.kl-on #videowrap object, html.kl-on #ytapiplayer {
      width:100% !important; height:100% !important;
    }
    html.kl-on #videowrap video { object-fit:contain; }

    /* ── Water strip + boats ── */
    #kl-water {
      position:fixed; top:42px; left:0; right:0; height:52px;
      background:rgba(0,30,80,0.55);
      border-bottom:2px solid rgba(80,180,255,0.35);
      z-index:810; overflow:hidden; pointer-events:none;
    }
    #kl-water::after { content:''; position:absolute; bottom:0; left:0; right:0; height:4px; background:rgba(100,200,255,0.25); }
    .kl-boat { position:absolute; bottom:6px; transform:translateX(-50%); pointer-events:none; }
    .kl-boat.sub { bottom:-8px; }
    .kl-boat-in { display:flex; flex-direction:column; align-items:center; gap:1px; animation:kl-bob 2.4s ease-in-out infinite; }
    .kl-boat.sub .kl-boat-in { animation:kl-sub-bob 3s ease-in-out infinite; }
    @keyframes kl-bob     { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
    @keyframes kl-sub-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
    .kl-boat-sail { width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; margin-bottom:-1px; }
    .kl-boat-hull {
      border-radius:0 0 12px 12px; height:16px; min-width:60px;
      display:flex; align-items:center; justify-content:center;
      font:700 9px sans-serif; color:#fff; padding:0 8px; white-space:nowrap;
    }
    .kl-boat-sub-hull {
      border-radius:10px; height:18px; min-width:80px;
      display:flex; align-items:center; justify-content:center;
      font:700 9px sans-serif; color:#fff; padding:0 10px; white-space:nowrap;
    }
    .kl-boat-score { font:700 8px sans-serif; color:rgba(255,220,80,0.9); margin-top:1px; }

    /* ── Bubbles ── */
    #kl-bubbles {
      position:fixed; top:var(--kl-top); left:0; right:0; bottom:var(--kl-bottom);
      pointer-events:none; overflow:hidden; z-index:800;
    }
    html:not(.kl-mode-bubbles) #kl-bubbles { display:none; }
    .kl-bubble {
      position:absolute; top:0; left:0; padding:7px 14px; border-radius:22px;
      font:600 13px/1.4 system-ui,sans-serif; color:#fff;
      white-space:nowrap; max-width:310px; overflow:hidden; text-overflow:ellipsis;
      pointer-events:none; will-change:transform,opacity; text-shadow:0 1px 2px rgba(0,0,0,0.5);
    }
    .kl-bubble img { max-height:26px; vertical-align:middle; }
    .kl-pop { position:fixed; font-size:20px; z-index:820; pointer-events:none; animation:kl-pop-anim .55s ease-out forwards; }
    @keyframes kl-pop-anim { 0% { opacity:1; transform:scale(1) translateY(0); } 100% { opacity:0; transform:scale(2.2) translateY(-18px); } }
    .kl-powerup {
      position:fixed; z-index:830; pointer-events:none; font:700 12px sans-serif; color:#ffcc44;
      text-shadow:0 0 6px rgba(0,0,0,0.8); animation:kl-pu-anim 1.4s ease-out forwards;
    }
    @keyframes kl-pu-anim { 0% { opacity:1; transform:translateY(0); } 100% { opacity:0; transform:translateY(-30px); } }

    /* ── Normal chat log (real CyTube #messagebuffer, moved here) ── */
    #kl-chatlog {
      display:none; position:fixed; left:8px; bottom:calc(var(--kl-bottom) + 6px);
      width:min(440px, calc(100vw - 16px)); height:min(42vh, calc(100vh - var(--kl-top) - var(--kl-bottom) - 16px));
      background:rgba(0,10,28,0.55); border:1px solid rgba(125,216,255,0.25);
      border-radius:12px; z-index:850; overflow:hidden;
    }
    html.kl-mode-normal #kl-chatlog { display:block; }
    #kl-chatlog #messagebuffer {
      height:100% !important; max-height:none !important; width:100% !important; margin:0 !important;
      padding:6px 8px !important; overflow-y:auto !important; background:transparent !important;
      border:0 !important; color:#fff; font:13px/1.4 system-ui,sans-serif; text-shadow:0 1px 2px #000;
      -webkit-overflow-scrolling:touch;
    }
    #kl-chatlog .timestamp { opacity:0.55; }

    /* ── Poll area (CyTube #pollwrap moved here so people can still vote) ── */
    #kl-poll-slot {
      position:fixed; top:calc(var(--kl-top) + 6px); right:8px;
      width:min(340px, calc(100vw - 16px)); max-height:50vh; overflow-y:auto; z-index:870;
    }
    #kl-poll-slot .well {
      background:rgba(0,10,28,0.88) !important; color:#fff !important;
      border:1px solid rgba(125,216,255,0.45) !important; border-radius:12px !important;
    }

    /* ── Bottom: users, input, tools ── */
    #kl-bottom {
      position:fixed; left:0; right:0; bottom:0; z-index:900;
      padding:6px 10px calc(8px + env(safe-area-inset-bottom, 0px));
      background:rgba(0,10,28,0.88); border-top:1px solid rgba(0,150,255,0.28);
      display:flex; flex-direction:column; gap:6px; font-family:system-ui,sans-serif;
    }
    #kl-userlist-row {
      display:flex; gap:5px; align-items:center; overflow-x:auto; white-space:nowrap;
      min-height:24px; scrollbar-width:none; -webkit-overflow-scrolling:touch;
    }
    #kl-userlist-row::-webkit-scrollbar { display:none; }
    .kl-ul-label { font-size:11px; color:rgba(160,210,255,0.5); margin-right:2px; flex-shrink:0; }
    .kl-upill {
      display:inline-flex; align-items:center; gap:5px; flex-shrink:0; cursor:pointer;
      padding:1px 8px; border-radius:20px; border:1px solid currentColor;
      background:rgba(0,0,0,0.35); font:700 11px/1.75 system-ui,sans-serif;
    }
    .kl-upill small { font:500 9px ui-monospace,Menlo,monospace; opacity:0.7; }
    #kl-inputrow { display:flex; align-items:center; gap:8px; }
    #kl-input {
      flex:1; min-width:0; height:36px; box-sizing:border-box;
      background:rgba(0,0,0,0.52); border:1.5px solid rgba(0,150,255,0.35); border-radius:18px;
      padding:0 14px; color:#e8f4ff; font:14px system-ui,sans-serif; outline:none; caret-color:#7dd8ff;
    }
    #kl-input::placeholder { color:rgba(200,230,255,0.3); }
    #kl-throttle-warn { display:none; font-size:11px; color:#ffcc44; white-space:nowrap; }
    #kl-toolrow { display:flex; align-items:center; gap:8px; }
    #kl-seg { display:flex; gap:4px; padding-left:8px; margin-left:2px; border-left:1px solid rgba(125,216,255,0.25); }
    #kl-mode-label { font-size:11px; color:rgba(160,210,255,0.6); margin-left:2px; }

    /* ── Emoji / emote picker ── */
    #kl-emote-pop {
      display:none; position:fixed; left:10px; bottom:calc(var(--kl-bottom) + 6px); z-index:950;
      width:min(380px, calc(100vw - 20px)); max-height:46vh; flex-direction:column; gap:6px; padding:8px;
      background:rgba(0,10,28,0.97); border:1.5px solid rgba(125,216,255,0.5); border-radius:12px;
    }
    #kl-emote-pop.open { display:flex; }
    #kl-emote-search {
      height:32px; box-sizing:border-box; border-radius:16px; padding:0 12px;
      background:rgba(0,0,0,0.5); border:1px solid rgba(0,150,255,0.35); color:#e8f4ff; font:13px system-ui,sans-serif; outline:none;
    }
    #kl-emoji-row { display:flex; flex-wrap:wrap; gap:2px; }
    #kl-emoji-row button, .kl-emote-cell {
      background:transparent; border:0; cursor:pointer; font-size:20px; line-height:1; padding:4px; border-radius:8px;
    }
    #kl-emoji-row button:active, .kl-emote-cell:active { background:rgba(0,150,255,0.35); }
    #kl-emote-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(44px,1fr)); gap:4px; overflow-y:auto; min-height:0; }
    .kl-emote-cell img { max-width:40px; max-height:40px; display:block; margin:0 auto; }
    #kl-emote-empty { color:rgba(200,230,255,0.5); font:12px system-ui,sans-serif; padding:4px; }

    /* ── Identity card (tap a user pill) ── */
    #kl-idcard {
      display:none; position:fixed; left:10px; bottom:calc(var(--kl-bottom) + 6px); z-index:950;
      width:min(320px, calc(100vw - 20px)); box-sizing:border-box; padding:10px 12px;
      background:rgba(0,10,28,0.97); border:1.5px solid rgba(125,216,255,0.5); border-radius:12px;
      color:#cfeaff; font:12px system-ui,sans-serif;
    }
    #kl-idcard b { font-size:14px; }
    #kl-idcard code { display:block; margin-top:6px; font:10px/1.4 ui-monospace,Menlo,monospace; word-break:break-all; color:#a8ff78; }

    @media (prefers-reduced-motion:reduce) {
      .kl-boat-in, .kl-boat.sub .kl-boat-in { animation:none; }
    }
  `;

  // ───────────────────────────────────────────────────────────────────────────
  //  SETUP
  // ───────────────────────────────────────────────────────────────────────────
  function setup() {
    const root = document.documentElement;
    root.classList.add("kl-on");

    Object.assign(document.body.style, {
      backgroundImage:      "url('" + BG_IMAGE + "')",
      backgroundSize:       "cover",
      backgroundPosition:   "center center",
      backgroundRepeat:     "no-repeat",
      backgroundAttachment: "fixed",
    });

    $("head").append('<style id="kl-styles">' + CSS + "</style>");

    // Grab things we need to keep alive BEFORE hiding their parents
    const buf      = document.getElementById("messagebuffer");
    const pollwrap = document.getElementById("pollwrap");

    // ── Build UI ──────────────────────────────────────────────────────────
    $("body").append(`
      <div id="kl-nav">
        <button id="kl-menu-btn" class="kl-ibtn tip-down tip-l" data-tip="Menu: channel options and settings" aria-label="Menu" aria-expanded="false"></button>
        <span id="kl-title">🐟 Klaus Fish Bowl</span>
        <span id="kl-nav-count" class="tip-down" data-tip="People in the channel"></span>
        <span class="kl-spacer"></span>
        <span id="kl-welcome">Welcome, <b id="kl-uname"></b></span>
        <button id="kl-logout" class="kl-textbtn tip-down tip-r" data-tip="Log out of CyTube">Log out</button>
      </div>
      <div id="kl-water"></div>
      <div id="kl-bubbles"></div>
      <div id="kl-chatlog"></div>
      <div id="kl-poll-slot"></div>
      <div id="kl-emote-pop">
        <input id="kl-emote-search" type="text" placeholder="Search channel emotes…" autocomplete="off" spellcheck="false" />
        <div id="kl-emoji-row"></div>
        <div id="kl-emote-grid"></div>
      </div>
      <div id="kl-idcard"></div>
      <div id="kl-bottom">
        <div id="kl-userlist-row"><span class="kl-ul-label">online:</span></div>
        <div id="kl-inputrow">
          <button id="kl-emote-btn" class="kl-ibtn tip-l" data-tip="Emotes and emoji" aria-label="Emotes and emoji">😀</button>
          <input id="kl-input" type="text" placeholder="Message the fish bowl…" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="240" />
          <span id="kl-throttle-warn">⏳ not sent</span>
          <button id="kl-sendbtn" class="kl-ibtn tip-r" data-tip="Send message (Enter)" aria-label="Send message">🚀</button>
        </div>
        <div id="kl-toolrow">
          <button id="kl-poll-btn" class="kl-ibtn tip-l" data-tip="New poll" aria-label="New poll">📊</button>
          <div id="kl-seg" role="group" aria-label="How chat is shown">
            <button class="kl-ibtn" data-mode="normal"  data-tip="Chat log: scroll back through past messages" aria-label="Chat log">💬</button>
            <button class="kl-ibtn" data-mode="bubbles" data-tip="Bubbles: messages float up over the video"  aria-label="Bubbles">🫧</button>
            <button class="kl-ibtn" data-mode="off"     data-tip="Messages off: video only"                 aria-label="Messages off">🙈</button>
          </div>
          <span id="kl-mode-label"></span>
        </div>
      </div>`);

    const $id = (i) => document.getElementById(i);
    const waterEl     = $id("kl-water");
    const bubbleLayer = $id("kl-bubbles");
    const chatlogEl   = $id("kl-chatlog");
    const pollSlot    = $id("kl-poll-slot");
    const bottomEl    = $id("kl-bottom");
    const inputEl     = $id("kl-input");
    const emotePop    = $id("kl-emote-pop");
    const idCard      = $id("kl-idcard");
    const menuBtn     = $id("kl-menu-btn");
    const pollBtn     = $id("kl-poll-btn");

    menuBtn.textContent = MENU_EMOJI;

    // Klaus's Logs button lives in the top bar (left of "Welcome"); its panel drops down under the nav
    if (logToggleEl) {
      logToggleEl.style.cssText = "";
      logToggleEl.className = "kl-ibtn tip-down tip-r";
      $id("kl-nav").insertBefore(logToggleEl, $id("kl-welcome"));
    }

    // Move the real chat log and poll area into our containers, then hide the rest
    chatlogEl.appendChild(buf);
    if (pollwrap) pollSlot.appendChild(pollwrap);
    $("#chatwrap").hide();
    $("#rightpane-inner").hide();
    dbg("CyTube chat hidden; messagebuffer" + (pollwrap ? " + pollwrap" : "") + " relocated");

    // ── Keep --kl-bottom in sync with the chat bar height ─────────────────
    function syncBottom() {
      const h = Math.ceil(bottomEl.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty("--kl-bottom", h + "px");
    }
    if (window.ResizeObserver) new ResizeObserver(syncBottom).observe(bottomEl);
    syncBottom();

    // ── Tooltips: long-press on touch screens ─────────────────────────────
    document.querySelectorAll("#kl-nav [data-tip], #kl-bottom [data-tip]").forEach(el => {
      let t = null;
      el.addEventListener("touchstart", () => {
        t = setTimeout(() => {
          el.classList.add("kl-tip-show");
          el._klHold = Date.now();
          setTimeout(() => el.classList.remove("kl-tip-show"), 2200);
        }, 450);
      }, { passive: true });
      ["touchend", "touchmove", "touchcancel"].forEach(ev =>
        el.addEventListener(ev, () => clearTimeout(t), { passive: true }));
      el.addEventListener("contextmenu", e => e.preventDefault());
      el.addEventListener("click", e => {
        if (el._klHold && Date.now() - el._klHold < 900) {
          e.preventDefault(); e.stopImmediatePropagation(); el._klHold = 0;
        }
      }, true);
    });

    // ── Nav bar: menu panel + welcome / log out ───────────────────────────
    const navEl = document.querySelector("nav.navbar, .navbar-fixed-top");

    function findLogout() {
      return document.querySelector("#logout a, a#logout, #logout, a[href*='logout']");
    }
    // Hide the original welcome/log out inside the panel (we show our own)
    const wel = document.getElementById("welcome");
    if (wel) $(wel).hide();
    const lo = findLogout();
    if (lo) { const li = lo.closest("li"); $(li || lo).hide(); }

    function setMenu(open) {
      root.classList.toggle("kl-menu-open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.classList.toggle("on", open);
    }
    menuBtn.addEventListener("click", e => { e.stopPropagation(); closeLogs(); setMenu(!root.classList.contains("kl-menu-open")); });
    if (navEl) {
      navEl.addEventListener("click", e => {
        const a = e.target.closest ? e.target.closest("a") : null;
        if (a && !a.classList.contains("dropdown-toggle") && !a.getAttribute("data-toggle")) setTimeout(() => setMenu(false), 60);
      });
    } else {
      dbg("WARN: original CyTube navbar not found — menu will be empty");
    }

    function clientName() { return (typeof CLIENT !== "undefined" && CLIENT && CLIENT.name) ? CLIENT.name : ""; }
    function isGuest()    { return typeof CLIENT !== "undefined" && CLIENT && CLIENT.guest; }

    $id("kl-logout").addEventListener("click", () => {
      if (isGuest() || !clientName()) {
        location.href = "/login?dest=" + encodeURIComponent(location.href);
        return;
      }
      const el = findLogout();
      if (!el) { dbg("logout element not found"); return; }
      (el.tagName === "A" ? el : (el.querySelector("a") || el)).click();
    });

    function syncNav() {
      const nm = clientName();
      $id("kl-uname").textContent = nm || "…";
      $id("kl-logout").textContent = (isGuest() || !nm) ? "Log in" : "Log out";
      $id("kl-logout").setAttribute("data-tip", (isGuest() || !nm) ? "Log in to CyTube" : "Log out of CyTube");
      const m = ($("#usercount").text() || "").match(/\d+/);
      $id("kl-nav-count").textContent = m ? "👥 " + m[0] : "";
    }
    syncNav();
    setInterval(syncNav, 2500);

    // ── Boats ─────────────────────────────────────────────────────────────
    function boatLeft(name) {
      const w = window.innerWidth || 400, pad = 56;
      return pad + ident(name).frac * Math.max(10, w - pad * 2);
    }

    function renderBoat(name) {
      const id    = ident(name);
      const score = boatScores[name] || 0;
      const power = getPower(score);

      if (boatEls[name]) boatEls[name].remove();

      const boat = document.createElement("div");
      boat.className = "kl-boat" + (power === 2 ? " sub" : "");
      boat.style.left = boatLeft(name) + "px";

      const inner = document.createElement("div");
      inner.className = "kl-boat-in";
      inner.style.animationDelay = (id.frac * 2.4).toFixed(2) + "s";

      if (power === 2) {
        const hull = document.createElement("div");
        hull.className = "kl-boat-sub-hull";
        hull.style.background = id.hullBg;
        hull.style.border = "1.5px solid " + id.color;
        hull.textContent = "🤿 " + name;
        inner.appendChild(hull);
      } else {
        const sail = document.createElement("div");
        sail.className = "kl-boat-sail";
        sail.style.borderBottom = "14px solid " + id.color;
        inner.appendChild(sail);
        const hull = document.createElement("div");
        hull.className = "kl-boat-hull";
        hull.style.background = id.hullBg;
        hull.style.border = "1.5px solid " + id.color;
        hull.style.minWidth = power === 1 ? "85px" : "60px";
        hull.textContent = (power === 1 ? "⚡ " : "🚣 ") + name;
        inner.appendChild(hull);
      }

      const scoreEl = document.createElement("div");
      scoreEl.className = "kl-boat-score";
      scoreEl.textContent = score > 0 ? score + " pts" : "";
      inner.appendChild(scoreEl);

      boat.appendChild(inner);
      waterEl.appendChild(boat);
      boatEls[name] = boat;
    }

    function ensureBoat(name) {
      if (!(name in boatScores)) boatScores[name] = 0;
      if (!boatEls[name]) { renderBoat(name); dbg("boat spawned: " + name); }
    }

    window.addEventListener("resize", () => {
      Object.keys(boatEls).forEach(n => { boatEls[n].style.left = boatLeft(n) + "px"; });
      syncBottom();
    });

    function showPop(x, y, emoji) {
      const pop = document.createElement("div");
      pop.className = "kl-pop";
      pop.textContent = emoji;
      pop.style.left = x + "px";
      pop.style.top  = y + "px";
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 600);
    }

    function showPowerUp(x, y, text) {
      const pu = document.createElement("div");
      pu.className = "kl-powerup";
      pu.textContent = text;
      pu.style.left = x + "px";
      pu.style.top  = y + "px";
      document.body.appendChild(pu);
      setTimeout(() => pu.remove(), 1500);
    }

    // ── Identity card ─────────────────────────────────────────────────────
    let idTimer = null;
    function showIdCard(name) {
      const id = ident(name);
      idCard.innerHTML = "";
      const b = document.createElement("b"); b.textContent = name; b.style.color = id.color;
      const meta = document.createElement("div"); meta.textContent = "sha256 of “" + name.toLowerCase() + "” · hue " + (parseInt(id.hex.slice(0, 4), 16) % 360) + "°";
      const code = document.createElement("code"); code.textContent = id.hex;
      idCard.appendChild(b); idCard.appendChild(meta); idCard.appendChild(code);
      idCard.style.display = "block";
      clearTimeout(idTimer);
      idTimer = setTimeout(() => { idCard.style.display = "none"; }, 6000);
    }
    idCard.addEventListener("click", () => { idCard.style.display = "none"; });

    // ── Userlist sync ─────────────────────────────────────────────────────
    let lastUserCount = -1;

    function refreshUserList(forceLog) {
      const row = $id("kl-userlist-row");
      row.innerHTML = '<span class="kl-ul-label">online:</span>';
      const items = document.querySelectorAll("#userlist .userlist_item");
      const count = items.length;
      if (forceLog || count !== lastUserCount) {
        dbg("userlist: " + count + " user" + (count !== 1 ? "s" : ""));
        lastUserCount = count;
      }
      const present = {};
      items.forEach(div => {
        const nameSpan = div.children[1];
        if (!nameSpan) return;
        const name = nameSpan.textContent.trim();
        if (!name) return;
        present[name] = true;
        ensureBoat(name);
        const id   = ident(name);
        const pill = document.createElement("span");
        pill.className = "kl-upill";
        pill.style.color = id.color;
        pill.title = "sha256 " + id.hex;
        pill.appendChild(document.createTextNode(name));
        const small = document.createElement("small");
        small.textContent = "#" + id.short;
        pill.appendChild(small);
        pill.addEventListener("click", () => showIdCard(name));
        row.appendChild(pill);
      });
      // Remove boats of people who left (keep their score in case they come back)
      if (count > 0) {
        Object.keys(boatEls).forEach(n => {
          if (!present[n]) { boatEls[n].remove(); delete boatEls[n]; dbg("boat left: " + n); }
        });
      }
    }

    refreshUserList(true);
    setInterval(() => refreshUserList(false), 3000);
    const ulEl = document.getElementById("userlist");
    if (ulEl) new MutationObserver(() => refreshUserList(true)).observe(ulEl, { childList: true, subtree: true });

    // ── Bubble engine (single rAF loop) ───────────────────────────────────
    const WATER_INTERCEPT_BASE = 5;
    const MAX_BUBBLES = 30;
    const bubbles = [];

    function clearBubbles() {
      while (bubbles.length) bubbles.pop().el.remove();
    }

    function spawnBubble(name, frag, preview) {
      bubblesSpawned++;
      dbg("BUBBLE #" + bubblesSpawned + " " + name + ": " + preview.substring(0, 25));
      if (bubbles.length >= MAX_BUBBLES) bubbles.shift().el.remove();

      const id = ident(name);
      const el = document.createElement("div");
      el.className = "kl-bubble";
      el.style.background = id.bubbleBg;
      el.style.borderLeft = "3px solid " + id.color;
      el.appendChild(frag);
      bubbleLayer.appendChild(el);

      const lW = bubbleLayer.clientWidth  || window.innerWidth;
      const lH = bubbleLayer.clientHeight || (window.innerHeight - 226);
      const w  = el.offsetWidth || 120;
      const x  = 8 + Math.random() * Math.max(4, lW - w - 16);
      const b = {
        el: el, name: name, w: w, x: x, y: lH,
        drift: (Math.random() - 0.5) * 0.9,
        speed: 0.9 + Math.random() * 1.1,
      };
      el.style.transform = "translate(" + b.x + "px," + b.y + "px)";
      bubbles.push(b);
    }

    function eatBubble(i, b, bname) {
      bubbles.splice(i, 1);
      b.el.remove();

      const bScore = boatScores[bname] || 0;
      const prevPower = getPower(bScore);
      boatScores[bname] = bScore + 1;
      const newPower = getPower(boatScores[bname]);

      const popX = boatLeft(bname);
      const popY = waterEl.getBoundingClientRect().bottom - 20;
      showPop(popX, popY, newPower === 2 ? "🌊" : newPower === 1 ? "💥" : "💧");
      if (newPower > prevPower) {
        const puText = newPower === 2 ? "🤿 SUBMARINE!" : "⚡ SPEEDBOAT!";
        showPowerUp(popX - 40, popY - 30, puText);
        dbg("POWER UP " + bname + " → " + puText);
      }
      renderBoat(bname);
      dbg("eat: " + bname + " ate a bubble (" + boatScores[bname] + " pts)");
    }

    const FADE_Z = 25;
    let lastTs = performance.now();
    function tick(ts) {
      const dt = Math.min(50, ts - lastTs) / 16.667;
      lastTs = ts;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.speed * dt;
        b.x += b.drift * dt;
        b.el.style.transform = "translate(" + b.x + "px," + b.y + "px)";
        if (b.y < FADE_Z) b.el.style.opacity = Math.max(0, b.y / FADE_Z).toFixed(3);

        if (b.y < WATER_INTERCEPT_BASE + 40) {
          const cx = b.x + (b.el.offsetWidth || b.w) / 2;
          const names = Object.keys(boatEls);
          let eaten = false;
          for (let k = 0; k < names.length; k++) {
            const bname  = names[k];
            const bScore = boatScores[bname] || 0;
            const checkY = WATER_INTERCEPT_BASE + getInterceptY(bScore);
            if (b.y < checkY && Math.abs(cx - boatLeft(bname)) < getCatchRadius(bScore)) {
              eatBubble(i, b, bname);
              eaten = true;
              break;
            }
          }
          if (eaten) continue;
        }
        if (b.y < -60) { b.el.remove(); bubbles.splice(i, 1); }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // ── Incoming chat → bubbles ───────────────────────────────────────────
    const SKIP_CLASS_FRAGMENTS = ["nick-highlight", "server-msg", "$server$"];
    const SKIP_NAMES = ["$server$", "$voteskip$", "$poll$"];
    const seen = new WeakSet();
    let lastSeenName = "";

    function senderName(node) {
      let name = "";
      const strongEl = node.querySelector("strong.username");
      if (strongEl) { name = strongEl.textContent.trim().replace(/:\s*$/, ""); lastSeenName = name; }
      if (!name) {
        const cls = node.className || "";
        const idx = cls.indexOf("chat-msg-");
        if (idx !== -1) { name = cls.slice(idx + 9).split(" ")[0]; if (name) lastSeenName = name; }
      }
      if (!name && lastSeenName) name = lastSeenName;
      return name;
    }

    // Color usernames in the normal chat log with the user's hash color
    function colorizeNode(node, name) {
      const s = node.querySelector && node.querySelector("strong.username");
      if (s && name) s.style.color = ident(name).color;
    }

    function messageFragment(node, name) {
      const frag = document.createDocumentFragment();
      let msgEl = null;
      const kids = Array.from(node.children);
      for (let i = kids.length - 1; i >= 0; i--) {
        const c = kids[i];
        if (c.tagName !== "SPAN") continue;
        if (c.classList.contains("timestamp")) continue;
        if (c.querySelector("strong.username")) continue;
        msgEl = c; break;
      }
      if (msgEl) {
        Array.from(msgEl.childNodes).forEach(n => frag.appendChild(n.cloneNode(true)));
      } else {
        const full = node.textContent.trim();
        const pfx = name + ": ";
        frag.appendChild(document.createTextNode(full.startsWith(pfx) ? full.slice(pfx.length).trim() : full));
      }
      const preview = (frag.textContent || "").trim();
      if (!preview && !(frag.querySelector && frag.querySelector("img"))) return null;
      return { frag: frag, preview: preview || "[emote]" };
    }

    function processNode(node, historyOnly) {
      if (!(node instanceof HTMLElement) || seen.has(node)) return;
      seen.add(node);
      if (node.tagName !== "DIV") return;
      const cls = node.className || "";
      if (SKIP_CLASS_FRAGMENTS.some(f => cls.includes(f))) return;

      const name = senderName(node);
      if (!name || SKIP_NAMES.includes(name)) return;
      colorizeNode(node, name);
      if (historyOnly) return;

      msgsProcessed++;
      ensureBoat(name);
      if (currentMode !== "bubbles") return;

      const m = messageFragment(node, name);
      if (!m) return;
      spawnBubble(name, m.frag, m.preview);
    }

    dbg("buf ready, existing: " + buf.querySelectorAll("div").length);
    buf.querySelectorAll("div[class*='chat-msg']").forEach(n => processNode(n, true));
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(n => processNode(n, false)));
    }).observe(buf, { childList: true, subtree: false });

    // ── Chat modes ────────────────────────────────────────────────────────
    const MODE_LABEL = { normal: "Chat log", bubbles: "Bubbles", off: "Video only" };

    function setMode(m) {
      if (!MODE_LABEL[m]) m = "bubbles";
      currentMode = m;
      store.set("kl_mode", m);
      root.classList.remove("kl-mode-normal", "kl-mode-bubbles", "kl-mode-off");
      root.classList.add("kl-mode-" + m);
      document.querySelectorAll("#kl-seg [data-mode]").forEach(btn => {
        const on = btn.getAttribute("data-mode") === m;
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      $id("kl-mode-label").textContent = MODE_LABEL[m];
      if (m !== "bubbles") clearBubbles();
      if (m === "normal") { setTimeout(() => { buf.scrollTop = buf.scrollHeight; }, 30); }
      dbg("chat mode: " + m);
    }
    document.querySelectorAll("#kl-seg [data-mode]").forEach(btn =>
      btn.addEventListener("click", () => setMode(btn.getAttribute("data-mode"))));
    setMode(store.get("kl_mode") || "bubbles");

    // ── Poll button ───────────────────────────────────────────────────────
    function syncPollBtn() {
      const orig = document.getElementById("newpollbtn");
      const hidden = !orig || orig.classList.contains("hidden") || orig.style.display === "none";
      pollBtn.style.display = hidden ? "none" : "";
    }
    pollBtn.addEventListener("click", () => {
      const orig = document.getElementById("newpollbtn");
      if (orig) orig.click();
      else if (typeof showPollMenu === "function") showPollMenu();
      else dbg("new poll button not found");
    });
    syncPollBtn();
    setInterval(syncPollBtn, 2500);

    // ── Emote / emoji picker ──────────────────────────────────────────────
    const EMOJIS = "😀 😂 🤣 😍 😎 😭 😡 👍 👎 🙏 🔥 🎉 💀 👀 ❤️ 🐟 🐠 🐡 🦈 🌊 🫧 ⚓ 🍔 🥤 🍫".split(" ");
    const emojiRow  = $id("kl-emoji-row");
    const emoteGrid = $id("kl-emote-grid");
    const emoteSearch = $id("kl-emote-search");

    function insertAtCursor(txt) {
      const s = inputEl.selectionStart != null ? inputEl.selectionStart : inputEl.value.length;
      const e = inputEl.selectionEnd   != null ? inputEl.selectionEnd   : s;
      inputEl.value = inputEl.value.slice(0, s) + txt + inputEl.value.slice(e);
      const p = s + txt.length;
      try { inputEl.setSelectionRange(p, p); } catch (err) {}
      inputEl.focus();
    }

    EMOJIS.forEach(em => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = em; b.setAttribute("aria-label", em);
      b.addEventListener("click", () => { insertAtCursor(em); setEmote(false); });
      emojiRow.appendChild(b);
    });

    function renderEmotes() {
      const q = emoteSearch.value.trim().toLowerCase();
      const list = (typeof CHANNEL !== "undefined" && CHANNEL && Array.isArray(CHANNEL.emotes)) ? CHANNEL.emotes : [];
      emoteGrid.innerHTML = "";
      let shown = 0;
      for (let i = 0; i < list.length && shown < 300; i++) {
        const em = list[i];
        if (!em || !em.name || !em.image) continue;
        if (q && em.name.toLowerCase().indexOf(q) === -1) continue;
        const cell = document.createElement("button");
        cell.type = "button"; cell.className = "kl-emote-cell"; cell.title = em.name;
        const img = document.createElement("img");
        img.loading = "lazy"; img.alt = em.name; img.src = em.image;
        cell.appendChild(img);
        cell.addEventListener("click", () => { insertAtCursor(em.name + " "); setEmote(false); });
        emoteGrid.appendChild(cell);
        shown++;
      }
      if (!shown) {
        const none = document.createElement("div");
        none.id = "kl-emote-empty";
        none.textContent = list.length ? "No emotes match." : "This channel has no custom emotes.";
        emoteGrid.appendChild(none);
      }
    }
    emoteSearch.addEventListener("input", renderEmotes);

    function setEmote(open) {
      emotePop.classList.toggle("open", open);
      $id("kl-emote-btn").classList.toggle("on", open);
      if (open) { idCard.style.display = "none"; renderEmotes(); }
    }
    $id("kl-emote-btn").addEventListener("click", e => { e.stopPropagation(); setEmote(!emotePop.classList.contains("open")); });
    emotePop.addEventListener("click", e => e.stopPropagation());

    document.addEventListener("click", e => {
      if (!e.target.closest) return;
      if (!e.target.closest("#kl-menu-btn") && !e.target.closest("nav.navbar") && !e.target.closest(".navbar-fixed-top")) setMenu(false);
      if (!e.target.closest("#kl-emote-pop") && !e.target.closest("#kl-emote-btn")) setEmote(false);
      if (!e.target.closest("#kl-log-panel") && !e.target.closest("#kl-log-btn") && !e.target.closest("#kl-status-overlay")) closeLogs();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { setMenu(false); setEmote(false); closeLogs(); } });

    // ── Send (goes through CyTube's own #chatline handler so /commands,
    //    history, mod flair and throttling behave exactly like stock CyTube) ──
    function warnNotSent() {
      $("#kl-throttle-warn").stop(true, true).fadeIn(100).delay(1200).fadeOut(400);
    }

    function sendMsg() {
      const text = inputEl.value.trim();
      if (!text) return;
      const cl = document.getElementById("chatline");
      if (cl) {
        cl.value = text;
        const ev = $.Event("keydown");
        ev.which = 13; ev.keyCode = 13;
        $(cl).trigger(ev);
        if (cl.value === text) {            // CyTube did not consume it (throttled)
          cl.value = "";
          dbg("not sent (throttled)");
          warnNotSent();
          return;
        }
        dbg("sent via #chatline: " + text.substring(0, 30));
      } else {
        const meta = {};
        if (typeof USEROPTS !== "undefined" && typeof CLIENT !== "undefined") {
          if (USEROPTS.modhat && CLIENT.rank >= 2) meta.modflair = CLIENT.rank;
        }
        dbg("emit fallback: " + text.substring(0, 30));
        window.socket.emit("chatMsg", { msg: text, meta: meta });
      }
      inputEl.value = "";
      inputEl.focus();
    }

    inputEl.addEventListener("keydown", e => {
      if (e.keyCode === 13) { e.preventDefault(); sendMsg(); }
    });
    $id("kl-sendbtn").addEventListener("click", sendMsg);

    statusMsg = "active";
    dbg("setup complete — v7.1.01");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 350);
  }

})();
