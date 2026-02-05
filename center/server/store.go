package main

import "sync"

type Store struct {
	mu sync.Mutex

	services    map[string]Service                    // ServiceID -> Service
	deployments map[string]map[string]*DeploymentState // SiteName -> ServiceID -> state

	allocations map[string]AllocationRecord // allocationId -> record

	// instanceId -> last delay ms (用于 c-ps view 展示)
	lastDelay map[string]int
}

type DeploymentState struct {
	Deployment   Deployment
	GasAvailable int // 内部逻辑，不在页面显示
}

type AllocationRecord struct {
	ServiceID  string
	SiteName   string
	InstanceID string
}

func NewStore() *Store {
	return &Store{
		services:     map[string]Service{},
		deployments:  map[string]map[string]*DeploymentState{},
		allocations:  map[string]AllocationRecord{},
		lastDelay:    map[string]int{},
	}
}
