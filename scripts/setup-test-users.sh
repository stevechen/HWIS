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

# Extract session tokens - handle potential Convex warnings by isolating the JSON block
# We look for the first '{' and everything after until the last '}'
CLEAN_JSON=$(echo "$RESULT" | sed -n '/{/,/}/p')

TEACHER_TOKEN=$(echo "$CLEAN_JSON" | jq -r '.teacherSessionToken')
ADMIN_TOKEN=$(echo "$CLEAN_JSON" | jq -r '.adminSessionToken')
SUPER_TOKEN=$(echo "$CLEAN_JSON" | jq -r '.superSessionToken')

if [ "$TEACHER_TOKEN" = "null" ] || [ -z "$TEACHER_TOKEN" ]; then
  echo "Error: Failed to get teacher session token"
  exit 1
fi

if [ "$ADMIN_TOKEN" = "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Error: Failed to get admin session token"
  exit 1
fi

if [ "$SUPER_TOKEN" = "null" ] || [ -z "$SUPER_TOKEN" ]; then
  echo "Error: Failed to get super session token"
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
      "value": "teacher",
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
      "value": "admin",
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

# Super admin storage state
cat > e2e/.auth/super.json << EOF
{
  "cookies": [
    {
      "name": "convex_session_token",
      "value": "$SUPER_TOKEN",
      "domain": "localhost",
      "path": "/",
      "expires": -1,
      "httpOnly": true,
      "secure": false,
      "sameSite": "Lax"
    },
    {
      "name": "hwis_test_auth",
      "value": "super",
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

# Test storage state (uses teacher role for basic auth)
cat > e2e/.auth/test.json << EOF
{
  "cookies": [
    {
      "name": "hwis_test_auth",
      "value": "teacher",
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
echo "Created auth files:"
ls -la e2e/.auth/
echo ""
echo "To run authenticated tests:"
echo "  bun run test:e2e:auth"
echo ""
echo "To clean up test users:"
echo "  bun convex run testSetup:cleanupTestUsers"
