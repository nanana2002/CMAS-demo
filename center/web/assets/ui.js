function $(id){ return document.getElementById(id); }
function setErr(msg){ const el=$("err"); if(el) el.textContent = msg || ""; }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s){ return escapeHtml(s); }

// -------- Network Log (center) --------
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

  line("Network Log ready.");
}
// --------------------------------------

function defaultDeployment(){
  return {
    SiteName: "site2",
    ServiceID: "LLM1",
    Gas: 2,
    Cost: 4,
    "CSCI-ID": "site2-a|site2-b",
    instances: [
      { instanceId: "site2-a", addr: "/site2-a" },
      { instanceId: "site2-b", addr: "/site2-b" },
    ],
  };
}

function initDeploymentPage(){
  if (!$("btnRegister")) return;

  const d = defaultDeployment();
  $("SiteName").value = d.SiteName;
  $("ServiceID").value = d.ServiceID;
  $("Gas").value = d.Gas;
  $("Cost").value = d.Cost;
  $("CSCI_ID").value = d["CSCI-ID"];
  $("Instances").value = JSON.stringify(d.instances, null, 2);

  $("btnRegister").onclick = async ()=>{
    setErr("");
    try{
      const dep = {
        SiteName: ($("SiteName").value||"").trim(),
        ServiceID: ($("ServiceID").value||"").trim(),
        Gas: Number(($("Gas").value||"0")),
        Cost: Number(($("Cost").value||"0")),
        "CSCI-ID": ($("CSCI_ID").value||"").trim(),
        instances: JSON.parse($("Instances").value||"[]"),
      };
      await apiCreateDeployment(dep);
      setErr("OK");
    }catch(e){
      setErr(String(e));
    }
  };
}

async function renderSiteTable(){
  const tbody = $("tblDeploy")?.querySelector("tbody");
  if (!tbody) return;

  setErr("");
  tbody.innerHTML = "";
  try{
    const data = await apiGetDeployments();
    const list = data.deployments || [];
    for (const d of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(d.SiteName||"")}</td>
        <td>${escapeHtml(d.ServiceID||"")}</td>
        <td>${escapeHtml(d.Gas ?? "")}</td>
        <td>${escapeHtml(d.Cost ?? "")}</td>
        <td>${escapeHtml(d["CSCI-ID"]||"")}</td>
        <td>
          <button class="btn danger" data-site="${escapeAttr(d.SiteName||"")}" data-svc="${escapeAttr(d.ServiceID||"")}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("button[data-site]").forEach(btn=>{
      btn.onclick = async ()=>{
        setErr("");
        try{
          await apiDeleteDeployment(btn.getAttribute("data-site"), btn.getAttribute("data-svc"));
          await renderSiteTable();
        }catch(e){
          setErr(String(e));
        }
      };
    });
  }catch(e){
    setErr(String(e));
  }
}

function initSiteTablePage(){
  if (!$("btnRefreshDeploy")) return;
  $("btnRefreshDeploy").onclick = renderSiteTable;
  renderSiteTable();
}

async function renderCps(){
  const tbody = $("tblCps")?.querySelector("tbody");
  if (!tbody) return;

  setErr("");
  tbody.innerHTML = "";
  try{
    const data = await apiGetCpsView();
    const list = data.cps || [];
    for (const r of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r["CS-ID"]||"")}</td>
        <td>${escapeHtml(r["CSCI-ID"]||"")}</td>
        <td>${escapeHtml(r.Gas ?? "")}</td>
        <td>${escapeHtml(r.Cost ?? "")}</td>
        <td>${escapeHtml(r.Computingtime||"")}</td>
        <td>${escapeHtml(r.Networkdelay ?? "")}</td>
      `;
      tbody.appendChild(tr);
    }
  }catch(e){
    setErr(String(e));
  }
}

function initCpsPage(){
  if (!$("btnRefreshCps")) return;
  $("btnRefreshCps").onclick = renderCps;
  renderCps();
}

// init
installNetworkLog("center");
initDeploymentPage();
initSiteTablePage();
initCpsPage();
