package main

import (
	"errors"
	"sort"
)

const (
	wDelay = 0.6
	wCost  = 0.4
)

type scored struct {
	m     Measurement
	cost  int
	cscid string
	score float64
}

func (s *Store) Candidates(serviceID string) []Candidate {
	s.mu.Lock()
	defer s.mu.Unlock()

	var out []Candidate
	for siteName, bySvc := range s.deployments {
		st, ok := bySvc[serviceID]
		if !ok {
			continue
		}
		out = append(out, Candidate{
			SiteName:  siteName,
			ServiceID: serviceID,
			Gas:       st.Deployment.Gas,
			Cost:      st.Deployment.Cost,
			CSCI_ID:   st.Deployment.CSCI_ID,
			Instances: st.Deployment.Instances,
		})
	}
	return out
}

func (s *Store) Allocate(req AllocateRequest) (AllocateResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if req.ServiceID == "" {
		return AllocateResponse{}, errors.New("missing ServiceID")
	}

	var cands []scored
	var costs []float64
	var delays []float64

	for _, m := range req.Measurements {
		bySvc, ok := s.deployments[m.SiteName]
		if !ok {
			continue
		}
		st, ok := bySvc[req.ServiceID]
		if !ok {
			continue
		}
		if st.GasAvailable <= 0 {
			continue
		}

		// 记录最后一次 delay，用于 c-ps view
		s.lastDelay[m.InstanceID] = m.DelayMs

		cands = append(cands, scored{
			m:     m,
			cost:  st.Deployment.Cost,
			cscid: st.Deployment.CSCI_ID,
		})
		costs = append(costs, float64(st.Deployment.Cost))
		delays = append(delays, float64(m.DelayMs))
	}

	if len(cands) == 0 {
		return AllocateResponse{}, errors.New("no available candidates (Gas exhausted or no deployment)")
	}

	nCost := minMaxNorm(costs)
	nDelay := minMaxNorm(delays)

	for i := range cands {
		cands[i].score = wCost*nCost[i] + wDelay*nDelay[i]
	}

	sort.Slice(cands, func(i, j int) bool {
		if cands[i].score == cands[j].score {
			return cands[i].m.DelayMs < cands[j].m.DelayMs
		}
		return cands[i].score < cands[j].score
	})

	chosen := cands[0]
	st := s.deployments[chosen.m.SiteName][req.ServiceID]

	// 原子扣减 1 slot
	st.GasAvailable -= 1
	if st.GasAvailable < 0 {
		st.GasAvailable = 0
	}

	allocationID := newID("alloc")
	s.allocations[allocationID] = AllocationRecord{
		ServiceID:  req.ServiceID,
		SiteName:   chosen.m.SiteName,
		InstanceID: chosen.m.InstanceID,
	}

	return AllocateResponse{
		AllocationID: allocationID,
		ServiceID:    req.ServiceID,
		InstanceID:   chosen.m.InstanceID,
		Addr:         chosen.m.Addr,
		CSCI_ID:      chosen.cscid,
		Cost:         chosen.cost,
		GasRemaining: st.GasAvailable,
	}, nil
}

func (s *Store) Release(allocationID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	rec, ok := s.allocations[allocationID]
	if !ok {
		return errors.New("allocation not found")
	}

	if bySvc, ok := s.deployments[rec.SiteName]; ok {
		if st, ok := bySvc[rec.ServiceID]; ok {
			st.GasAvailable += 1
			if st.GasAvailable > st.Deployment.Gas {
				st.GasAvailable = st.Deployment.Gas
			}
		}
	}

	delete(s.allocations, allocationID)
	return nil
}
