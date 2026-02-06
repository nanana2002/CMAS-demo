function $(id){ return document.getElementById(id); }
function setErr(msg){ const el=$("err"); if(el) el.textContent = msg || ""; }

// -------- Network Log (moved from HTML) --------
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
// ----------------------------------------------

function defaultLLM1(){
  return {
    ServiceID: "LLM1",
    ServiceName: "General LLM Chat Service",
    Input: "text prompt",
    ServiceDescription: "A general-purpose LLM chat service. Input is user text, output is assistant text.",
    ServiceRuningCode: "POST /invoke {ServiceID, Input} -> {OutputType:'text', Output:'...'}",
    ComputingRequirement: "CPU >= 2 cores (demo)",
    StorageRequirement: "Low (demo)",
    ComputingTime: "~1s (demo)",
    SoftwareDependency: "none (demo)",
    // DataSample / Result 已删除
  };
}

async function initRegisterPage(){
  if (!$("btnRegister")) return;

  const d = defaultLLM1();
  for (const k of Object.keys(d)) {
    if ($(k)) $(k).value = d[k];
  }

  $("btnRegister").onclick = async () => {
    setErr("");
    try{
      const svc = {};
      // 注意：不再包含 DataSample / Result
      [
        "ServiceID","ServiceName","Input","ServiceDescription","ServiceRuningCode",
        "ComputingRequirement","StorageRequirement","ComputingTime","SoftwareDependency"
      ].forEach(f=>{
        svc[f] = ($(f)?.value || "").trim();
      });

      await apiCreateService(svc);
      setErr("OK");
    }catch(e){
      setErr(String(e));
    }
  };
}

async function renderTable(){
  const tbody = $("tbl")?.querySelector("tbody");
  if (!tbody) return;

  setErr("");
  tbody.innerHTML = "";
  try{
    const data = await apiGetServices();
    const list = data.services || [];

    for (const s of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.ServiceID||"")}</td>
        <td>${escapeHtml(s.ServiceName||"")}</td>
        <td>${escapeHtml(s.Input||"")}</td>
        <td>${escapeHtml(s.ServiceDescription||"")}</td>
        <td>${escapeHtml(s.ServiceRuningCode||"")}</td>
        <td>${escapeHtml(s.ComputingRequirement||"")}</td>
        <td>${escapeHtml(s.StorageRequirement||"")}</td>
        <td>${escapeHtml(s.ComputingTime||"")}</td>
        <td>${escapeHtml(s.SoftwareDependency||"")}</td>
        <td><button class="btn danger" data-id="${escapeAttr(s.ServiceID||"")}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-id]").forEach(btn=>{
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        setErr("");
        try{
          await apiDeleteService(id);
          await renderTable();
        }catch(e){
          setErr(String(e));
        }
      };
    });
  }catch(e){
    setErr(String(e));
  }
}

function initTablePage(){
  if (!$("btnRefresh")) return;
  $("btnRefresh").onclick = renderTable;
  renderTable();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s){ return escapeHtml(s); }

// init
installNetworkLog("platform");
initRegisterPage();
initTablePage();
