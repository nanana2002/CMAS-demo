package main

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
)

func newID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

func minMaxNorm(vals []float64) []float64 {
	if len(vals) == 0 {
		return vals
	}
	minv, maxv := vals[0], vals[0]
	for _, v := range vals {
		if v < minv {
			minv = v
		}
		if v > maxv {
			maxv = v
		}
	}
	out := make([]float64, len(vals))
	den := maxv - minv
	if den == 0 {
		for i := range out {
			out[i] = 0
		}
		return out
	}
	for i, v := range vals {
		out[i] = (v - minv) / den
	}
	return out
}

func buildInstancesFromCSCI(csci string, siteName string, gas int) []Instance {
    // 优先用 csci 列表；空则回退按 siteName+gas 生成
    csci = strings.TrimSpace(csci)
    if csci != "" {
        parts := strings.Split(csci, "|")
        out := make([]Instance, 0, len(parts))
        for _, p := range parts {
            id := strings.TrimSpace(p)
            if id == "" {
                continue
            }
            out = append(out, Instance{
                InstanceID: id,
                Addr:       "/" + id, // 关键：走 client 同源反代路径
            })
        }
        if len(out) > 0 {
            return out
        }
    }
    return buildInstances(siteName, gas)
}
