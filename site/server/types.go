package main

type InvokeRequest struct {
	ServiceID string `json:"ServiceID"`
	Input     string `json:"Input"`
}

type InvokeResponse struct {
	InstanceID string `json:"InstanceID"`
	ServiceID  string `json:"ServiceID"`
	OutputType string `json:"OutputType"` // "text" (demo)
	Output     string `json:"Output"`
}
