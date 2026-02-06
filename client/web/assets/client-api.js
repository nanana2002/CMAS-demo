const CENTER_BASE = `${location.protocol}//${location.hostname}:8080`;

async function apiGetServices(){
  const r = await fetch(`${CENTER_BASE}/api/services`);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiCpsCandidates(serviceId){
  const r = await fetch(`${CENTER_BASE}/api/cps/candidates`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ServiceID: serviceId}),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiCpsAllocate(serviceId, measurements){
  const r = await fetch(`${CENTER_BASE}/api/cps/allocate`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ServiceID: serviceId, measurements}),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiRelease(allocationId){
  const r = await fetch(`${CENTER_BASE}/api/allocations/release`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({allocationId}),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function siteInvoke(addrPrefix, serviceId, input){
  const model = (serviceId === "LLM1") ? "qwen2.5:0.5b" : "qwen2.5:0.5b";

  const r = await fetch(`${addrPrefix}/ollama/api/generate`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ model, prompt: input, stream: false }),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json(); // { response: "...", ... }
}

