package main

import (
	"fmt"
	"strings"
	"time"
)

func mockLLMReply(instanceID, input string) string {
	trim := strings.TrimSpace(input)
	if trim == "" {
		return fmt.Sprintf("[%s] empty input", instanceID)
	}
	// demo：简单规则 + 时间戳
	return fmt.Sprintf("[%s] %s\n(time=%s)", instanceID, trim, time.Now().Format(time.RFC3339))
}
