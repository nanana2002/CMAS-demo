package main

import (
	"errors"
	"sort"
)

type scored struct {
	m     Measurement
	cost  int
	cscid string
	score float64
}

// 权重规则：
// cost=most & delay=least -> 0.7 / 0.3
// cost=least & delay=most -> 0.3 / 0.7
// 其它组合（most/most、least/least、空值等）-> 0.5 / 0.5
func weights(costPref, delayPref string) (wCost, wDelay float64) {
	if costPref == "most" && delayPref == "least" {
		return 0.7, 0.3
	}
	if costPref == "least" && delayPref == "most" {
		return 0.3, 0.7
	}
	return 0.5, 0.5
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

	// 兜底：如果前端没传 measurements，就用该 service 的所有 instances 生成测量（delay=0）
	if len(req.Measurements) == 0 {
		for siteName, bySvc := range s.deployments {
			st, ok := bySvc[req.ServiceID]
			if !ok {
				continue
			}
			for _, inst := range st.Deployment.Instances {
				req.Measurements = append(req.Measurements, Measurement{
					SiteName:   siteName,
					InstanceID: inst.InstanceID,
					Addr:       inst.Addr,
					DelayMs:    0,
				})
			}
		}
	}

	// 计算动态权重
	wCost, wDelay := weights(req.CostPref, req.DelayPref)

	// 建索引：instanceId -> (siteName, addr, cost, cscid, state)
	type instInfo struct {
		siteName string
		addr     string
		cost     int
		cscid    string
		st       *DeploymentState
	}
	instIndex := map[string]instInfo{}

	for siteName, bySvc := range s.deployments {
		st, ok := bySvc[req.ServiceID]
		if !ok {
			continue
		}
		// 这里不提前按 GasAvailable 过滤：让评分阶段统一处理
		for _, inst := range st.Deployment.Instances {
			instIndex[inst.InstanceID] = instInfo{
				siteName: siteName,
				addr:     inst.Addr, // 例如 "/site2-a"
				cost:     st.Deployment.Cost,
				cscid:    st.Deployment.CSCI_ID,
				st:       st,
			}
		}
	}

	var cands []scored
	var costs []float64
	var delays []float64

	for _, m := range req.Measurements {
		// 兼容前端 SiteName 传错/传空：优先用 instanceId 反查归属
		info, ok := instIndex[m.InstanceID]
		if !ok {
			// 如果 instanceId 找不到，再尝试用 m.SiteName 去 deployments 找（兼容老行为）
			bySvc, ok2 := s.deployments[m.SiteName]
			if !ok2 {
				continue
			}
			st2, ok2 := bySvc[req.ServiceID]
			if !ok2 {
				continue
			}
			if st2.GasAvailable <= 0 {
				continue
			}
			// 从该 deployment 的实例列表里找 addr
			addr := ""
			for _, inst := range st2.Deployment.Instances {
				if inst.InstanceID == m.InstanceID {
					addr = inst.Addr
					break
				}
			}
			if addr == "" {
				continue
			}
			info = instInfo{
				siteName: m.SiteName,
				addr:     addr,
				cost:     st2.Deployment.Cost,
				cscid:    st2.Deployment.CSCI_ID,
				st:       st2,
			}
		}

		// 没 gas 直接跳过
		if info.st.GasAvailable <= 0 {
			continue
		}

		// 记录最后一次 delay，用于 c-ps view
		s.lastDelay[m.InstanceID] = m.DelayMs

		// 补齐/纠正 measurement 字段（防止前端传错）
		m.SiteName = info.siteName
		if m.Addr == "" {
			m.Addr = info.addr
		}

		cands = append(cands, scored{
			m:     m,
			cost:  info.cost,
			cscid: info.cscid,
		})
		costs = append(costs, float64(info.cost))
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
		Addr:         chosen.m.Addr, // 期望是 "/site2-a" 或 "/site2-b"
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
