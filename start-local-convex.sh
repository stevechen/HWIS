#!/bin/bash
set -e

echo "Starting local Convex development server..."

# Start local Convex development
npx convex dev --port 3210 > /dev/null 2>&1 &

echo "Waiting for Convex development server to start..."
sleep 5

echo "Local Convex development is running at http://127.0.0.1:3210"
echo "Run 'bun dev' in another terminal to start the frontend dev server"
echo ""
echo "Note: This will connect to your local Convex deployment"
echo "Visit http://localhost:5173/test-auth to test the authentication system"