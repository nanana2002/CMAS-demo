const CENTER_BASE = `${location.protocol}//${location.hostname}:8080`;

async function apiGetServices() {
  const r = await fetch(`${CENTER_BASE}/api/services`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiCreateService(svc) {
  const r = await fetch(`${CENTER_BASE}/api/services`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(svc),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDeleteService(serviceId) {
  const r = await fetch(`${CENTER_BASE}/api/services/${encodeURIComponent(serviceId)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
