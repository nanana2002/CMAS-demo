# CMAS-demo
cd ~/CMAS-demo
docker compose down
docker compose build --no-cache center
docker compose up -d

http://192.168.235.48:8080/site-table.html
http://192.168.235.48:8082/service-selection.html
http://192.168.235.48:8080/service-deployment.html


sudo cat /data/docker/volumes/cmas-demo_center_data/_data/store.json

curl -X POST http://localhost:8080/api/allocations/release \
-H "Content-Type: application/json" \
-d '{"allocationId": "alloc_1ad8b317b1051c94"}'
{"ok":true}