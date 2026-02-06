// nma.js — measure RTT by calling /ping (empty body). DO NOT resp.json().

function joinPath(a, b) {
  if (!a.endsWith("/")) a += "/";
  if (b.startsWith("/")) b = b.slice(1);
  return a + b;
}

function buildPingUrl(addr) {
  // addr can be:
  // 1) "/site2-a"  (recommended; same-origin via client nginx)
  // 2) "http://host:port/site2-a"
  // 3) "http://host:port" (rare)
  if (!addr) throw new Error("missing addr");

  // If addr is relative, force same-origin
  if (addr.startsWith("/")) {
    return joinPath(window.location.origin, joinPath(addr, "ping"));
  }

  // absolute
  return joinPath(addr, "ping");
}

async function pingOnce(addr, timeoutMs = 2000) {
  const url = buildPingUrl(addr);
  const t0 = performance.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`ping ${url} -> HTTP ${resp.status}`);
    // IMPORTANT: /ping has empty body, no resp.json()/resp.text()
    const t1 = performance.now();
    return Math.max(0, Math.round(t1 - t0));
  } finally {
    clearTimeout(timer);
  }
}

// cands: [{SiteName, instances:[{instanceId, addr}, ...]}] OR flat instances
async function measureDelays(cands) {
  const out = [];

  for (const c of (cands || [])) {
    const siteName = c.SiteName || c.siteName || c.site || "";
    const insts = c.instances || c.Instances || c || [];
    if (!Array.isArray(insts)) continue;

    for (const inst of insts) {
      const instanceId = inst.instanceId || inst.InstanceID || inst.InstanceId;
      const addr = inst.addr || inst.Addr;
      const delayMs = await pingOnce(addr);

      out.push({
        siteName,
        instanceId,
        addr,       // keep as-is ("/site2-a" etc)
        delayMs,
      });
    }
  }
  return out;
}

// expose
window.pingOnce = pingOnce;
window.measureDelays = measureDelays;
