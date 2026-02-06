function $(id){ return document.getElementById(id); }
function setErr(msg){ const el=$("err"); if(el) el.textContent = msg || ""; }
function setStatus(msg){ const el=$("status"); if(el) el.textContent = msg || ""; }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

// -------- Network Log (client) --------
function installNetworkLog(containerName){
  const box = $("networkLog");
  if(!box) return;

  function ts(){
    const d = new Date();
    const p2 = (n)=>String(n).padStart(2,'0');
    return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}`;
  }
  function line(s){
    box.textContent += `[${ts()}] [${containerName}] ${s}\n`;
    box.scrollTop = box.scrollHeight;
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const method = (init && init.method) ? init.method.toUpperCase() : 'GET';
    const url = (typeof input === 'string') ? input : (input && input.url) ? input.url : String(input);
    const t0 = performance.now();
    try{
      line(`→ ${method} ${url}`);
      const res = await _fetch(input, init);
      const t1 = performance.now();
      line(`← ${method} ${url}  ${res.status}  ${(t1 - t0).toFixed(1)}ms`);
      return res;
    }catch(e){
      const t1 = performance.now();
      line(`× ${method} ${url}  ERR  ${(t1 - t0).toFixed(1)}ms  ${e && e.message ? e.message : e}`);
      throw e;
    }
  };

  line('Network Log ready.');
}
// --------------------------------------

// 偏好：localStorage key
const PREF_KEY = "cps_prefs_v1";
function loadPrefs(){
  try{
    const raw = localStorage.getItem(PREF_KEY);
    if(!raw) return { costPref: "most", delayPref: "least" };
    const o = JSON.parse(raw);
    return {
      costPref: (o.costPref === "least" || o.costPref === "most") ? o.costPref : "most",
      delayPref: (o.delayPref === "least" || o.delayPref === "most") ? o.delayPref : "least",
    };
  }catch(_){
    return { costPref: "most", delayPref: "least" };
  }
}
function savePrefs(costPref, delayPref){
  localStorage.setItem(PREF_KEY, JSON.stringify({costPref, delayPref}));
}

// --- selection page ---
async function renderCards(){
  const box = $("cards");
  if(!box) return;

  setErr("");
  box.innerHTML = "";
  try{
    const data = await apiGetServices();
    const list = data.services || [];
    for (const s of list) {
      const div = document.createElement("div");
      div.className = "card";
      div.style.cursor = "pointer";
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;">
          <div><span class="badge">${escapeHtml(s.ServiceID||"")}</span> ${escapeHtml(s.ServiceName||"")}</div>
          <div class="small">ComputingTime: ${escapeHtml(s.ComputingTime||"")}</div>
        </div>
        <div class="small" style="margin-top:8px;">Input: ${escapeHtml(s.Input||"")}</div>
        <div class="small" style="margin-top:6px;">Desc: ${escapeHtml(s.ServiceDescription||"")}</div>
      `;

      div.onclick = async () => {
        const serviceId = (s.ServiceID || "").trim();
        if(!serviceId) return;

        const costPref = ($("prefCost")?.value || "most");
        const delayPref = ($("prefDelay")?.value || "least");
        savePrefs(costPref, delayPref);

        // 先发消息给 center
        try{
          await apiClientSelection(serviceId, costPref, delayPref);
        }catch(e){
          // 不阻断跳转，但要显示错误
          setErr(String(e));
        }

        // 再跳转，把偏好带过去（invocation 也会从 localStorage 再兜底）
        location.href = `./service-invocation.html?serviceId=${encodeURIComponent(serviceId)}&costPref=${encodeURIComponent(costPref)}&delayPref=${encodeURIComponent(delayPref)}`;
      };

      box.appendChild(div);
    }
  }catch(e){
    setErr(String(e));
  }
}

function initSelection(){
  if(!$("btnRefresh")) return;

  // 初始化偏好下拉
  const p = loadPrefs();
  if($("prefCost")) $("prefCost").value = p.costPref;
  if($("prefDelay")) $("prefDelay").value = p.delayPref;

  $("prefCost") && ($("prefCost").onchange = () => savePrefs($("prefCost").value, $("prefDelay")?.value || "least"));
  $("prefDelay") && ($("prefDelay").onchange = () => savePrefs($("prefCost")?.value || "most", $("prefDelay").value));

  $("btnRefresh").onclick = renderCards;
  renderCards();
}

// --- invocation page ---
let currentAllocationId = null;
let currentChosenAddr = null;

async function initInvocation(){
  const svcIdEl = $("svcId");
  if(!svcIdEl) return;

  const serviceId = getParam("serviceId") || "LLM1";
  svcIdEl.textContent = serviceId;

  // 取偏好：优先 query，其次 localStorage
  let costPref = getParam("costPref");
  let delayPref = getParam("delayPref");
  if(!costPref || !delayPref){
    const p = loadPrefs();
    costPref = costPref || p.costPref;
    delayPref = delayPref || p.delayPref;
  }

  $("btnSend").onclick = async ()=>{
    setErr("");
    setStatus("candidates...");
    try{
      const userText = ($("userInput")?.value || "").trim();
      if(!userText) {
        setErr("empty input");
        setStatus("");
        return;
      }

      // 1) candidates
      const candData = await apiCpsCandidates(serviceId);
      const candidates = candData.candidates || [];
      if(candidates.length === 0){
        setErr("no candidates");
        setStatus("");
        return;
      }

      // 2) client->site RTT
      setStatus("ping...");
      if (typeof measureDelays !== "function") {
        throw new Error("measureDelays is not defined (need to include ./assets/nma.js on service-invocation.html)");
      }
      const measurements = await measureDelays(candidates);

      // 3) allocate (扣 Gas) + 偏好
      setStatus(`allocate... (cost=${costPref}, delay=${delayPref})`);
      const alloc = await apiCpsAllocate(serviceId, measurements, costPref, delayPref);

      currentAllocationId = alloc.allocationId;
      currentChosenAddr = alloc.addr;

      if ($("btnEnd")) $("btnEnd").disabled = false;

      // 4) invoke
      setStatus(`invoke ${currentChosenAddr}...`);
      const resp = await siteInvoke(alloc.addr, serviceId, userText);
      if ($("modelOutput")) $("modelOutput").value = resp.response || "";

      setStatus(`done (chosen=${alloc.instanceId || ""})`);
    }catch(e){
      setErr(String(e));
      setStatus("");
    }
  };

  $("btnEnd").onclick = async ()=>{
    setErr("");
    try{
      if(!currentAllocationId){
        setErr("no allocation");
        return;
      }
      await apiRelease(currentAllocationId);
      currentAllocationId = null;
      currentChosenAddr = null;
      $("btnEnd").disabled = true;
      setStatus("released");
    }catch(e){
      setErr(String(e));
    }
  };
}

// init
installNetworkLog("client");
initSelection();
initInvocation();
