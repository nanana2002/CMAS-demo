package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type Store struct {
	mu sync.Mutex

	services    map[string]Service                          // ServiceID -> Service
	deployments map[string]map[string]*DeploymentState       // SiteName -> ServiceID -> state
	allocations map[string]AllocationRecord                  // allocationId -> record
	lastDelay   map[string]int                               // instanceId -> last delay ms (展示用)

	dataDir string
}

type DeploymentState struct {
	Deployment   Deployment
	GasAvailable int // 内部逻辑，不在页面显示
}

type AllocationRecord struct {
	ServiceID  string `json:"serviceId"`
	SiteName   string `json:"siteName"`
	InstanceID string `json:"instanceId"`
}

// ====== persistence snapshot ======

type storeSnapshot struct {
	Services    map[string]Service                    `json:"services"`
	Deployments map[string]map[string]*DeploymentState `json:"deployments"`
	Allocations map[string]AllocationRecord           `json:"allocations"`
	LastDelay   map[string]int                        `json:"lastDelay"`
}

func NewStore() *Store {
	dir := os.Getenv("DATA_DIR")
	if dir == "" {
		dir = "/data"
	}
	s := &Store{
		services:    map[string]Service{},
		deployments: map[string]map[string]*DeploymentState{},
		allocations: map[string]AllocationRecord{},
		lastDelay:   map[string]int{},
		dataDir:     dir,
	}
	_ = s.LoadFromDisk() // 启动即尝试恢复
	return s
}

func (s *Store) dataPath() string {
	return filepath.Join(s.dataDir, "store.json")
}

func (s *Store) LoadFromDisk() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = os.MkdirAll(s.dataDir, 0755)

	b, err := os.ReadFile(s.dataPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var snap storeSnapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return err
	}

	if snap.Services == nil {
		snap.Services = map[string]Service{}
	}
	if snap.Deployments == nil {
		snap.Deployments = map[string]map[string]*DeploymentState{}
	}
	if snap.Allocations == nil {
		snap.Allocations = map[string]AllocationRecord{}
	}
	if snap.LastDelay == nil {
		snap.LastDelay = map[string]int{}
	}

	s.services = snap.Services
	s.deployments = snap.Deployments
	s.allocations = snap.Allocations
	s.lastDelay = snap.LastDelay
	return nil
}

func (s *Store) saveLocked() error {
	_ = os.MkdirAll(s.dataDir, 0755)

	snap := storeSnapshot{
		Services:    s.services,
		Deployments: s.deployments,
		Allocations: s.allocations,
		LastDelay:   s.lastDelay,
	}

	b, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}

	tmp := s.dataPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, s.dataPath())
}

// ====== services ======

func (s *Store) UpsertService(svc Service) error {
	if svc.ServiceID == "" {
		return errors.New("missing ServiceID")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	s.services[svc.ServiceID] = svc
	return s.saveLocked()
}

func (s *Store) ListServices() []Service {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Service, 0, len(s.services))
	for _, v := range s.services {
		out = append(out, v)
	}
	return out
}

func (s *Store) DeleteService(serviceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.services, serviceID)

	// 同时清理 deployments 中引用该 service 的条目
	for siteName := range s.deployments {
		delete(s.deployments[siteName], serviceID)
		if len(s.deployments[siteName]) == 0 {
			delete(s.deployments, siteName)
		}
	}

	// allocations 也清一下（demo 简化：直接删记录，不做回补）
	for aid, rec := range s.allocations {
		if rec.ServiceID == serviceID {
			delete(s.allocations, aid)
		}
	}

	return s.saveLocked()
}

// ====== deployments ======

func makeInstanceId(siteName string, idx int) string {
	return fmt.Sprintf("%s-%c", siteName, rune('a'+idx))
}

// 关键：Addr 用 "/{instanceId}"（给 client 走同源网关）
func buildInstances(siteName string, gas int) []Instance {
	if gas < 1 {
		gas = 1
	}
	out := make([]Instance, 0, gas)
	for i := 0; i < gas; i++ {
		id := makeInstanceId(siteName, i)
		out = append(out, Instance{
			InstanceID: id,
			Addr:       "/" + id,
		})
	}
	return out
}

// dep.Instances 如果没填，按 Gas 自动生成；GasAvailable 初始=Gas
func (s *Store) UpsertDeployment(dep Deployment) error {
	if dep.SiteName == "" {
		return errors.New("missing SiteName")
	}
	if dep.ServiceID == "" {
		return errors.New("missing ServiceID")
	}
	if dep.Gas < 1 {
		return errors.New("Gas must be > 0")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if dep.Instances == nil || len(dep.Instances) == 0 {
		dep.Instances = buildInstances(dep.SiteName, dep.Gas)
	}

	if s.deployments[dep.SiteName] == nil {
		s.deployments[dep.SiteName] = map[string]*DeploymentState{}
	}

	// 如果已存在，尽量保留 GasAvailable（但不超过新 Gas）
	old := s.deployments[dep.SiteName][dep.ServiceID]
	gasAvail := dep.Gas
	if old != nil {
		gasAvail = old.GasAvailable
		if gasAvail > dep.Gas {
			gasAvail = dep.Gas
		}
	}
	s.deployments[dep.SiteName][dep.ServiceID] = &DeploymentState{
		Deployment:   dep,
		GasAvailable: gasAvail,
	}

	return s.saveLocked()
}

func (s *Store) ListDeployments() []Deployment {
	s.mu.Lock()
	defer s.mu.Unlock()

	var out []Deployment
	for _, bySvc := range s.deployments {
		for _, st := range bySvc {
			out = append(out, st.Deployment)
		}
	}
	return out
}

func (s *Store) DeleteDeployment(siteName, serviceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.deployments[siteName] != nil {
		delete(s.deployments[siteName], serviceID)
		if len(s.deployments[siteName]) == 0 {
			delete(s.deployments, siteName)
		}
	}

	// 清理 allocations（demo 简化）
	for aid, rec := range s.allocations {
		if rec.SiteName == siteName && rec.ServiceID == serviceID {
			delete(s.allocations, aid)
		}
	}

	return s.saveLocked()
}

// ====== delay (for view / scoring) ======

func (s *Store) SetLastDelay(instanceID string, delayMs int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastDelay[instanceID] = delayMs
	return s.saveLocked()
}

func (s *Store) GetLastDelay(instanceID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastDelay[instanceID]
}

// ====== allocation (扣 Gas=1) ======

var (
	ErrNotFound      = errors.New("not found")
	ErrNoGas         = errors.New("no gas available")
	ErrNoInstance    = errors.New("no instance")
	ErrBadAllocation = errors.New("bad allocation id")
)


// ---- persistence ----
func (s *Store) SaveToDisk() error {
	// 注意：这里不加锁，调用方要在解锁后调用（你 main.go 已经是解锁后调用）
	path := os.Getenv("STORE_PATH")
	if path == "" {
		path = "/data/store.json"
	}

	_ = os.MkdirAll(filepath.Dir(path), 0755)

	s.mu.Lock()
	snap := storeSnapshot{
		Services:    s.services,
		Deployments: s.deployments,
		Allocations: s.allocations,
		LastDelay:   s.lastDelay,
	}
	s.mu.Unlock()

	b, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}
