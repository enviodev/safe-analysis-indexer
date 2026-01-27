# Safe Analysis Indexer

## RabbitMQ Setup

```bash
docker compose -f docker-compose.rabbitmq.yml up -d
```

**UI:** http://localhost:15672 (user: `guest`, pass: `guest`)

## Viewing Messages

1. **Queues** → Add queue → Name: `test-queue` → Add
2. Click `test-queue` → Bindings → From: `safe_events`, Routing: `safe.#` → Bind
3. **Get messages** → Click "Get Message(s)" to see event payloads
