package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
)

// 全局 store：供所有 handler 使用
var store = NewStore()

func main() {
	// 可选：启动时从磁盘加载
	if err := store.LoadFromDisk(); err != nil {
		log.Printf("load store from disk failed: %v", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	// 静态页面
	mux.Handle("/", http.FileServer(http.Dir("./web")))

	// API
	mux.HandleFunc("/api/services", withCORS(servicesHandler))
	mux.HandleFunc("/api/services/", withCORS(serviceDeleteHandler))

	mux.HandleFunc("/api/deployments", withCORS(deploymentsHandler))
	mux.HandleFunc("/api/deployments/", withCORS(deploymentDeleteHandler))

	// cps 相关 handler 只做转发：逻辑在 store.Candidates/Allocate/Release
	mux.HandleFunc("/api/cps/candidates", withCORS(candidatesHandler))
	mux.HandleFunc("/api/cps/allocate", withCORS(allocateHandler))
	mux.HandleFunc("/api/allocations/release", withCORS(releaseHandler))
	mux.HandleFunc("/api/cps/view", withCORS(cpsViewHandler))

	addr := ":" + port
	log.Printf("center listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h(w, r)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// -------- services --------
func servicesHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		store.mu.Lock()
		defer store.mu.Unlock()
		var list []Service
		for _, v := range store.services {
			list = append(list, v)
		}
		writeJSON(w, map[string]any{"services": list})

	case http.MethodPost:
		var s Service
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(s.ServiceID) == "" {
			http.Error(w, "missing ServiceID", http.StatusBadRequest)
			return
		}
		store.mu.Lock()
		store.services[s.ServiceID] = s
		store.mu.Unlock()

		// 持久化（你要求“我要持久化”）
		_ = store.SaveToDisk()

		writeJSON(w, map[string]any{"ok": true})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func serviceDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/services/")
	if id == "" {
		http.Error(w, "missing ServiceID", http.StatusBadRequest)
		return
	}

	store.mu.Lock()
	delete(store.services, id)
	// 级联删除该 ServiceID 的部署
	for site := range store.deployments {
		delete(store.deployments[site], id)
		if len(store.deployments[site]) == 0 {
			delete(store.deployments, site)
		}
	}
	store.mu.Unlock()

	_ = store.SaveToDisk()

	writeJSON(w, map[string]any{"ok": true})
}

// -------- deployments --------
func deploymentsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		store.mu.Lock()
		defer store.mu.Unlock()
		var list []Deployment
		for _, bySvc := range store.deployments {
			for _, st := range bySvc {
				list = append(list, st.Deployment)
			}
		}
		writeJSON(w, map[string]any{"deployments": list})

	case http.MethodPost:
		var d Deployment
		if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(d.SiteName) == "" || strings.TrimSpace(d.ServiceID) == "" {
			http.Error(w, "missing SiteName or ServiceID", http.StatusBadRequest)
			return
		}
		if d.Gas < 0 || d.Cost < 0 {
			http.Error(w, "Gas/Cost must be >=0", http.StatusBadRequest)
			return
		}

		// ---- auto build instances (critical) ----
		// If UI didn't pass instances, derive from CSCI-ID like "site2-a|site2-b".
		// Addr must be relative so client can call same-origin: /site2-a/... , /site2-b/...
		if len(d.Instances) == 0 {
			csci := strings.TrimSpace(d.CSCI_ID)
			if csci != "" {
				parts := strings.Split(csci, "|")
				inst := make([]Instance, 0, len(parts))
				for _, p := range parts {
					id := strings.TrimSpace(p)
					if id == "" {
						continue
					}
					inst = append(inst, Instance{
						InstanceID: id,
						Addr:       "/" + id,
					})
				}
				if len(inst) > 0 {
					d.Instances = inst
				}
			}
			// fallback: if CSCI-ID empty or invalid, generate by siteName+gas
			if len(d.Instances) == 0 {
				d.Instances = buildInstances(d.SiteName, d.Gas)
			}
		}
		// normalize any user-provided absolute addr to relative
		for i := range d.Instances {
			id := strings.TrimSpace(d.Instances[i].InstanceID)
			if id == "" {
				continue
			}
			d.Instances[i].InstanceID = id
			d.Instances[i].Addr = "/" + id
		}
		// -----------------------------------------

		store.mu.Lock()
		if _, ok := store.deployments[d.SiteName]; !ok {
			store.deployments[d.SiteName] = map[string]*DeploymentState{}
		}
		// reset available gas; align with instance count to avoid "Gas>0 but no candidates"
		store.deployments[d.SiteName][d.ServiceID] = &DeploymentState{
			Deployment:   d,
			GasAvailable: len(d.Instances),
		}
		store.mu.Unlock()

		_ = store.SaveToDisk()

		writeJSON(w, map[string]any{"ok": true})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func deploymentDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p := strings.TrimPrefix(r.URL.Path, "/api/deployments/")
	parts := strings.Split(p, "/")
	if len(parts) < 2 {
		http.Error(w, "need /api/deployments/{SiteName}/{ServiceID}", http.StatusBadRequest)
		return
	}
	siteName := parts[0]
	serviceID := parts[1]

	store.mu.Lock()
	if bySvc, ok := store.deployments[siteName]; ok {
		delete(bySvc, serviceID)
		if len(bySvc) == 0 {
			delete(store.deployments, siteName)
		}
	}
	store.mu.Unlock()

	_ = store.SaveToDisk()

	writeJSON(w, map[string]any{"ok": true})
}

// -------- cps --------
func candidatesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req CandidatesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	list := store.Candidates(req.ServiceID)
	writeJSON(w, CandidatesResponse{Candidates: list})
}

func allocateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req AllocateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	resp, err := store.Allocate(req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	_ = store.SaveToDisk()

	writeJSON(w, resp)
}

func releaseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req ReleaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.AllocationID) == "" {
		http.Error(w, "missing allocationId", http.StatusBadRequest)
		return
	}
	if err := store.Release(req.AllocationID); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	_ = store.SaveToDisk()

	writeJSON(w, map[string]any{"ok": true})
}

// -------- cps view --------
func cpsViewHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET only", http.StatusMethodNotAllowed)
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	var rows []CPSViewRow
	for _, bySvc := range store.deployments {
		for _, st := range bySvc {
			comp := ""
			if svc, ok := store.services[st.Deployment.ServiceID]; ok {
				comp = svc.ComputingTime
			}

			minDelay := -1
			for _, inst := range st.Deployment.Instances {
				if d, ok := store.lastDelay[inst.InstanceID]; ok {
					if minDelay == -1 || d < minDelay {
						minDelay = d
					}
				}
			}
			if minDelay < 0 {
				minDelay = 0
			}

			rows = append(rows, CPSViewRow{
				CS_ID:         st.Deployment.ServiceID,
				CSCI_ID:       st.Deployment.CSCI_ID,
				Gas:           st.Deployment.Gas,
				Cost:          st.Deployment.Cost,
				Computingtime: comp,
				Networkdelay:  minDelay,
			})
		}
	}

	writeJSON(w, map[string]any{"cps": rows})
}
