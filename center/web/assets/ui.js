function $(id){ return document.getElementById(id); }
function setErr(msg){ const el=$("err"); if(el) el.textContent = msg || ""; }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s){ return escapeHtml(s); }

function defaultDeployment(){
  return {
    SiteName: "site2",
    ServiceID: "LLM1",
    Gas: 2,
    Cost: 4,
    "CSCI-ID": "127.0.0.1-127.0.0.2",
    instances: [
      { instanceId: "site2-a", addr: "http://localhost:9001" },
      { instanceId: "site2-b", addr: "http://localhost:9002" },
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


initDeploymentPage();
initSiteTablePage();
initCpsPage();
