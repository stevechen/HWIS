#!/bin/bash

# Script to set up test users for e2e tests
# Usage: ./scripts/setup-test-users.sh

set -e

# Create e2e/.auth directory
mkdir -p e2e/.auth

echo "Setting up test users..."
RESULT=$(bun convex run testSetup:setupTestUsers 2>&1)

if [ -z "$RESULT" ] || echo "$RESULT" | grep -q "error"; then
  echo "Error setting up test users: $RESULT"
  exit 1
fi

echo "Result: $RESULT"

# Extract session tokens
TEACHER_TOKEN=$(echo $RESULT | jq -r '.teacherSessionToken')
ADMIN_TOKEN=$(echo $RESULT | jq -r '.adminSessionToken')

if [ "$TEACHER_TOKEN" = "null" ] || [ -z "$TEACHER_TOKEN" ]; then
  echo "Error: Failed to get teacher session token"
  exit 1
fi

# Create storage state files
echo "Creating storage state files..."

# Teacher storage state
cat > e2e/.auth/teacher.json << EOF
{
  "cookies": [
    {
      "name": "convex_session_token",
      "value": "$TEACHER_TOKEN",
      "domain": "localhost",
      "path": "/",
      "expires": -1,
      "httpOnly": true,
      "secure": false,
      "sameSite": "Lax"
    },
    {
      "name": "hwis_test_auth",
      "value": "true",
      "domain": "localhost",
      "path": "/",
      "expires": -1,
      "httpOnly": false,
      "secure": false,
      "sameSite": "Lax"
    }
  ],
  "origins": []
}
EOF

# Admin storage state
cat > e2e/.auth/admin.json << EOF
{
  "cookies": [
    {
      "name": "convex_session_token",
      "value": "$ADMIN_TOKEN",
      "domain": "localhost",
      "path": "/",
      "expires": -1,
      "httpOnly": true,
      "secure": false,
      "sameSite": "Lax"
    },
    {
      "name": "hwis_test_auth",
      "value": "true",
      "domain": "localhost",
      "path": "/",
      "expires": -1,
      "httpOnly": false,
      "secure": false,
      "sameSite": "Lax"
    }
  ],
  "origins": []
}
EOF

echo ""
echo "Test users set up successfully!"
echo ""
echo "To run authenticated tests:"
echo "  bun run test:e2e:auth"
echo ""
echo "To clean up test users:"
echo "  bun convex run testSetup:cleanupTestUsers"
