.PHONY: test test-backend test-frontend build dev-backend dev-frontend docker-up docker-down e2e e2e-clean

test: test-backend test-frontend

test-backend:
	@echo "===> Running Backend Tests (Go Engine, Service, Handler, Seed)..."
	@cd backend && go test -count=1 ./...

test-frontend:
	@echo "===> Running Frontend Tests (Vitest + Testing Library)..."
	@cd frontend && npm test

build:
	@echo "===> Building Frontend..."
	@cd frontend && npm run build
	@echo "===> Building Backend..."
	@cd backend && go build -o /dev/null ./cmd/server

dev-backend:
	@cd backend && go run ./cmd/server

dev-frontend:
	@cd frontend && npm run dev

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

e2e:
	@echo "===> Running Playwright against the Compose stack (http://localhost:3000)..."
	@cd frontend && npx playwright test

e2e-clean:
	@echo "===> Removing smoke_* flags and their audit rows..."
	@./scripts/cleanup-e2e-data.sh
