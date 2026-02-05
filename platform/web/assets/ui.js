function $(id){ return document.getElementById(id); }
function setErr(msg){ const el=$("err"); if(el) el.textContent = msg || ""; }

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
    DataSample: "User: explain Shamir secret sharing",
    Result: "Assistant: Shamir secret sharing splits a secret into shares ...",
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
      ["ServiceID","ServiceName","Input","ServiceDescription","ServiceRuningCode","ComputingRequirement",
       "StorageRequirement","ComputingTime","SoftwareDependency","DataSample","Result"].forEach(f=>{
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
        <td>${escapeHtml((s.ServiceDescription||"").slice(0,120))}</td>
        <td>${escapeHtml(s.ComputingTime||"")}</td>
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

initRegisterPage();
initTablePage();
