package main

type Service struct {
	ServiceID            string `json:"ServiceID"`
	ServiceName          string `json:"ServiceName"`
	Input                string `json:"Input"`
	ServiceDescription   string `json:"ServiceDescription"`
	ServiceRuningCode    string `json:"ServiceRuningCode"`
	ComputingRequirement string `json:"ComputingRequirement"`
	StorageRequirement   string `json:"StorageRequirement"`
	ComputingTime        string `json:"ComputingTime"`
	SoftwareDependency   string `json:"SoftwareDependency"`
	DataSample           string `json:"DataSample"`
	Result               string `json:"Result"`
}

type Instance struct {
	InstanceID string `json:"instanceId"`
	Addr       string `json:"addr"`
}

type Deployment struct {
	SiteName  string `json:"SiteName"`
	ServiceID string `json:"ServiceID"`
	Gas       int    `json:"Gas"`
	Cost      int    `json:"Cost"`
	CSCI_ID   string `json:"CSCI-ID"`

	Instances []Instance `json:"instances"`
}

type CandidatesRequest struct {
	ServiceID string `json:"ServiceID"`
}

type Candidate struct {
	SiteName  string     `json:"SiteName"`
	ServiceID string     `json:"ServiceID"`
	Gas       int        `json:"Gas"` // 只暴露总Gas
	Cost      int        `json:"Cost"`
	CSCI_ID   string     `json:"CSCI-ID"`
	Instances []Instance `json:"instances"`
}

type CandidatesResponse struct {
	Candidates []Candidate `json:"candidates"`
}

type Measurement struct {
	SiteName   string `json:"SiteName"`
	InstanceID string `json:"instanceId"`
	Addr       string `json:"addr"`
	DelayMs    int    `json:"delayMs"`
}

type AllocateRequest struct {
	ServiceID    string        `json:"ServiceID"`
	Measurements []Measurement `json:"measurements"`
}

type AllocateResponse struct {
	AllocationID string `json:"allocationId"`
	ServiceID    string `json:"ServiceID"`
	InstanceID   string `json:"instanceId"`
	Addr         string `json:"addr"`
	CSCI_ID      string `json:"CSCI-ID"`
	Cost         int    `json:"Cost"`
	GasRemaining int    `json:"GasRemaining"`
}

type ReleaseRequest struct {
	AllocationID string `json:"allocationId"`
}

type CPSViewRow struct {
	CS_ID         string `json:"CS-ID"`
	CSCI_ID       string `json:"CSCI-ID"`
	Gas           int    `json:"Gas"`
	Cost          int    `json:"Cost"`
	Computingtime string `json:"Computingtime"`
	Networkdelay  int    `json:"Networkdelay"`
}
