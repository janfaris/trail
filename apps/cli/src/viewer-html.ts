export const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Trail — local viewer</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Mono", monospace; background:#0b0d10; color:#d6dde5; }
  header { padding: 14px 20px; border-bottom: 1px solid #1c2026; display:flex; gap:12px; align-items:baseline; }
  header h1 { margin:0; font-size:16px; letter-spacing:.5px; color:#7fd1ff;}
  header .sub { color:#5a6470; font-size:12px; }
  main { display:grid; grid-template-columns: 320px 1fr; height: calc(100vh - 51px); }
  aside { border-right: 1px solid #1c2026; overflow-y:auto; }
  .session { padding: 10px 14px; border-bottom: 1px solid #15181d; cursor:pointer; }
  .session:hover { background:#13171c; }
  .session.active { background:#172029; }
  .session .id { color:#9ec5ff; font-size: 12px; }
  .session .meta { color:#5a6470; font-size: 11px; margin-top: 2px; }
  section { overflow-y:auto; padding: 18px 24px; }
  .ev { border-left: 2px solid #2a3038; padding: 6px 12px; margin: 10px 0; }
  .ev .head { font-size: 11px; color:#5a6470; margin-bottom: 4px; text-transform: uppercase; letter-spacing:.5px; }
  .ev.prompt { border-color:#7fd1ff; }
  .ev.prompt .head { color:#7fd1ff; }
  .ev.completion { border-color:#9d8bff; }
  .ev.completion .head { color:#9d8bff; }
  .ev.tool_call { border-color:#ffb86c; }
  .ev.tool_call .head { color:#ffb86c; }
  pre { white-space: pre-wrap; word-break: break-word; margin:0; font: 13px/1.5 "SF Mono", monospace; color:#d6dde5; }
  .args { color:#8d96a3; font-size:12px; max-height: 220px; overflow:auto; }
  .empty { color:#5a6470; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>trail</h1>
  <span class="sub">local viewer · localhost</span>
</header>
<main>
  <aside id="list"></aside>
  <section id="detail"><div class="empty">Select a session.</div></section>
</main>
<script>
async function loadList() {
  const r = await fetch("/api/sessions");
  const rows = await r.json();
  const el = document.getElementById("list");
  if (!rows.length) { el.innerHTML = '<div class="empty">No sessions yet. Run <code>trail record</code> first.</div>'; return; }
  el.innerHTML = rows.map(s => \`
    <div class="session" data-id="\${s.id}">
      <div class="id">\${s.id}</div>
      <div class="meta">\${s.tool} · \${s.eventCount} events · \${new Date(s.startedAt).toLocaleString()}</div>
      <div class="meta">\${s.repo || ""}</div>
    </div>\`).join("");
  el.querySelectorAll(".session").forEach(node => {
    node.addEventListener("click", () => {
      el.querySelectorAll(".session").forEach(n => n.classList.remove("active"));
      node.classList.add("active");
      loadDetail(node.dataset.id);
    });
  });
}
async function loadDetail(id) {
  const r = await fetch("/api/sessions/" + encodeURIComponent(id));
  const s = await r.json();
  const det = document.getElementById("detail");
  if (s.error) { det.innerHTML = '<div class="empty">Not found.</div>'; return; }
  const events = (s.events || []).map(ev => {
    const head = \`<div class="head">\${ev.kind} · \${new Date(ev.at).toLocaleTimeString()}</div>\`;
    if (ev.kind === "prompt" || ev.kind === "completion") {
      return \`<div class="ev \${ev.kind}">\${head}<pre>\${escape(ev.text)}</pre></div>\`;
    }
    if (ev.kind === "tool_call") {
      return \`<div class="ev tool_call">\${head}<div><strong>\${escape(ev.name)}</strong></div><pre class="args">\${escape(JSON.stringify(ev.args, null, 2))}</pre></div>\`;
    }
    return \`<div class="ev">\${head}<pre>\${escape(JSON.stringify(ev))}</pre></div>\`;
  }).join("");
  det.innerHTML = \`<h2 style="margin:0 0 6px;font-size:15px;color:#7fd1ff">\${s.id}</h2>
    <div style="color:#5a6470;font-size:12px;margin-bottom:18px">\${s.tool} · \${s.repo || ""}</div>
    \${events || '<div class="empty">No events.</div>'}\`;
}
function escape(s) { return String(s ?? "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
loadList();
</script>
</body>
</html>`;
