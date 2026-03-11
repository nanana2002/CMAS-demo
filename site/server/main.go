package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9000"
	}
	instanceID := os.Getenv("INSTANCE_ID")
	if instanceID == "" {
		instanceID = "site-unknown"
	}

	mux := http.NewServeMux()

	// 供 RTT 测试
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"InstanceID": instanceID,
			"TS":         time.Now().UnixMilli(),
		})
	})

	// 供 client 调用
	mux.HandleFunc("/invoke", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var req InvokeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		out := mockLLMReply(instanceID, req.Input)
		resp := InvokeResponse{
			InstanceID: instanceID,
			ServiceID:  req.ServiceID,
			OutputType: "text",
			Output:     out,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	addr := ":" + port
	log.Printf("site %s listening on %s", instanceID, addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}
