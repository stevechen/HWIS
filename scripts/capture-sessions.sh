#!/bin/bash

# Script to capture Playwright storage state for multiple users
# Usage: ./capture-sessions.sh

echo "🔧 Session Capture Helper for HWIS Local Development"
echo "======================================"
echo ""
echo "This script will help you capture authentication sessions"
echo "for the 3 users needed for E2E testing."
echo ""

# Check if servers are running
if ! curl -s -I http://localhost:5173 | grep -q "200 OK"; then
    echo "❌ SvelteKit server not running on port 5173"
    echo "Please run: bun run dev"
    exit 1
fi

if ! curl -s -I http://127.0.0.1:3210 | grep -q "200 OK"; then
    echo "❌ Convex server not running on port 3210"
    echo "Please run: bun convex dev"
    exit 1
fi

echo "✅ Both servers are running"
echo ""

# Function to capture session
capture_session() {
    local email=$1
    local role=$2
    local filename=$3
    
    echo "📸 Capturing session for $email ($role)..."
    echo "   1. Open browser and go to: http://localhost:5173/login"
    echo "   2. Sign in with: $email"
    echo "   3. After successful login, keep browser open"
    echo "   4. Run: npx playwright codegen --device=\"Desktop Chrome\" --save-storage=e2e/.auth/$filename http://localhost:5173"
    echo "   5. Press Enter when ready to proceed..."
    read
}

# Capture sessions for all 3 users
capture_session "steve.stevechen@gmail.com" "Super Admin" "super.json"
capture_session "steve@hwhs.tc.edu.tw" "Admin" "admin.json"
capture_session "steve.homecook@gmail.com" "Teacher" "teacher.json"

echo ""
echo "✅ Session capture process completed!"
echo "📁 Files saved in: e2e/.auth/"
echo "🔍 Check files: ls -la e2e/.auth/"
ls -la e2e/.auth/