async function pingOnce(addr){
  const t0 = performance.now();
  const r = await fetch(`${addr}/ping`, { method:"GET" });
  if(!r.ok) throw new Error(await r.text());
  await r.json();
  const t1 = performance.now();
  return Math.round(t1 - t0);
}

// 对 candidates 的 instances 做 RTT 测试，返回 measurements
async function measureDelays(candidates){
  const out = [];
  for (const c of candidates) {
    for (const inst of (c.instances || [])) {
      const delayMs = await pingOnce(inst.addr);
      out.push({
        SiteName: c.SiteName,
        instanceId: inst.instanceId,
        addr: inst.addr,
        delayMs,
      });
    }
  }
  return out;
}
