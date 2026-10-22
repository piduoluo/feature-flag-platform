#!/bin/bash
set -e

echo "=========================================="
echo " Running Full Feature Flag Test Suite"
echo "=========================================="

echo ""
echo ">>> [1/2] Backend Tests (Go Engine, Service, Handler, Seed)"
cd backend
go test -count=1 ./...
cd ..

echo ""
echo ">>> [2/2] Frontend Tests (Vitest + React Testing Library)"
cd frontend
npm test
cd ..

echo ""
echo "=========================================="
echo " All Backend and Frontend Tests PASSED!"
echo "=========================================="
