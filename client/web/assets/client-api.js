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

// 新增：点击卡片先发一条消息到 center（demo 真实性）
async function apiClientSelection(serviceId, costPref, delayPref){
  const r = await fetch(`${CENTER_BASE}/api/client/selection`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      ServiceID: serviceId,
      Gas: 1,
      CostPref: costPref,
      DelayPref: delayPref,
      SelectedAt: new Date().toISOString(),
    }),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// allocate：携带 CostPref/DelayPref，影响 center 打分权重
async function apiCpsAllocate(serviceId, measurements, costPref, delayPref){
  const r = await fetch(`${CENTER_BASE}/api/cps/allocate`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      ServiceID: serviceId,
      measurements,
      CostPref: costPref,
      DelayPref: delayPref,
    }),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiRelease(allocationId){
  const r = await fetch(`${CENTER_BASE}/api/allocations/release`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    // 后端字段名是 allocationId（json tag），这里必须一致
    body: JSON.stringify({allocationId}),
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function siteInvoke(addrPrefix, serviceId, input){
  const model = "qwen3-vl:2b";

  // 终极兜底：清洗地址
  let cleanAddr = addrPrefix.replace(/\/ollama/g, "");
  cleanAddr = cleanAddr.replace(/\/+$/, "");
  if (!cleanAddr.startsWith("/")) cleanAddr = "/" + cleanAddr;
  const finalUrl = `${cleanAddr}/api/generate`;

  try {
    const r = await fetch(finalUrl, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ 
        model, 
        prompt: input, 
        stream: false,
        max_tokens: 10,  // 核心：限制最大生成100个令牌（可根据需求调整，如50/200）
        temperature: 0.5  // 降低随机性，回答更简洁
      }),
    });
    
    if(!r.ok) {
      const errorText = await r.text();
      throw new Error(`请求失败 [${r.status}]: ${errorText}`);
    }
    
    return r.json();
  } catch (err) {
    console.error(`调用网关失败 (原始地址: ${addrPrefix}, 清洗后: ${cleanAddr}):`, err.message);
    throw err;
  }
}