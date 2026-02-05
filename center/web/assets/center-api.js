const CENTER_BASE = `${location.protocol}//${location.hostname}:8080`;

async function apiGetServices(){
  const r = await fetch(`${CENTER_BASE}/api/services`);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiGetDeployments(){
  const r = await fetch(`${CENTER_BASE}/api/deployments`);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiCreateDeployment(dep){
  const r = await fetch(`${CENTER_BASE}/api/deployments`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(dep),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDeleteDeployment(siteName, serviceId){
  const r = await fetch(`${CENTER_BASE}/api/deployments/${encodeURIComponent(siteName)}/${encodeURIComponent(serviceId)}`,{
    method:"DELETE",
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiGetCpsView(){
  const r = await fetch(`${CENTER_BASE}/api/cps/view`);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
