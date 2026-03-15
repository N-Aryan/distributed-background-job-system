#!/bin/bash
# scripts/test-tasks.sh

API_URL="http://localhost:3000/api/v1"

echo "Creating high priority email task..."
curl -X POST $API_URL/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_send",
    "priority": "high",
    "payload": {
      "to": "user1@example.com",
      "subject": "High Priority Email",
      "body": "This is urgent!"
    }
  }'

echo -e "\n\nCreating medium priority image task..."
curl -X POST $API_URL/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image_process",
    "priority": "medium",
    "payload": {
      "imageUrl": "https://example.com/photo.jpg",
      "operations": ["resize", "compress", "watermark"]
    }
  }'

echo -e "\n\nCreating low priority data export task..."
curl -X POST $API_URL/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data_export",
    "priority": "low",
    "payload": {
      "exportType": "csv",
      "rowCount": 50000
    }
  }'

echo -e "\n\nCreating bulk tasks..."
for i in {1..10}
do
  curl -X POST $API_URL/tasks \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"email_send\",
      \"priority\": \"medium\",
      \"payload\": {
        \"to\": \"user$i@example.com\",
        \"subject\": \"Bulk Email $i\",
        \"body\": \"Message $i\"
      }
    }" &
done

wait

echo -e "\n\nAll tasks created!"