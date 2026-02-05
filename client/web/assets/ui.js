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
        <div class="small" style="margin-top:6px;">Desc: ${escapeHtml((s.ServiceDescription||"").slice(0,160))}</div>
        <div class="small" style="margin-top:6px;">Sample: ${escapeHtml((s.DataSample||"").slice(0,120))}</div>
        <div class="small" style="margin-top:6px;">Result: ${escapeHtml((s.Result||"").slice(0,120))}</div>
      `;
      div.onclick = () => {
        location.href = `./service-invocation.html?serviceId=${encodeURIComponent(s.ServiceID||"")}`;
      };
      box.appendChild(div);
    }
  }catch(e){
    setErr(String(e));
  }
}

function initSelection(){
  if(!$("btnRefresh")) return;
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

  $("btnSend").onclick = async ()=>{
    setErr("");
    setStatus("candidates...");
    try{
      const userText = ($("userInput").value || "").trim();
      if(!userText) {
        setErr("empty input");
        return;
      }

      // 1) candidates
      const candData = await apiCpsCandidates(serviceId);
      const candidates = candData.candidates || [];
      if(candidates.length === 0){
        setErr("no candidates");
        return;
      }

      // 2) client->site RTT
      setStatus("ping...");
      const measurements = await measureDelays(candidates);

      // 3) allocate (扣 Gas)
      setStatus("allocate...");
      const alloc = await apiCpsAllocate(serviceId, measurements);

      currentAllocationId = alloc.allocationId;
      currentChosenAddr = alloc.addr;

      $("btnEnd").disabled = false;

      // 4) invoke
      setStatus(`invoke ${currentChosenAddr}...`);
      const resp = await siteInvoke(currentChosenAddr, serviceId, userText);

      $("modelOutput").value = resp.Output || JSON.stringify(resp, null, 2);
      setStatus(`done (instance=${resp.InstanceID || ""})`);
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

initSelection();
initInvocation();
