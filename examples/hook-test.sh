#!/bin/bash
# Hook test script for claude-conversation-logger
# Tests the API logging functionality with improved token parsing

echo "🧪 Testing Claude Code Hook..."

# Test data
TEST_SESSION_ID="test_session_$(date +%s)"
TEST_CONTENT="Testing hook functionality with improved token parsing"

# Create test input
TEST_INPUT=$(cat << EOF
{
  "session_id": "$TEST_SESSION_ID",
  "hook_event_name": "UserPromptSubmit",
  "cwd": "$PWD",
  "prompt": "$TEST_CONTENT"
}
EOF
)

# Check if API is running
echo "📡 Checking API health..."
if ! curl -s http://localhost:3003/health | grep -q "healthy"; then
    echo "❌ API not running. Start with: docker compose up -d"
    exit 1
fi

echo "✅ API is healthy"

# Test hook execution
echo "🔧 Testing hook execution..."
echo "$TEST_INPUT" | python3 ~/.claude/hooks/api-logger.py

if [ $? -eq 0 ]; then
    echo "✅ Hook executed successfully"
else
    echo "❌ Hook failed"
    exit 1
fi

# Verify data was logged
sleep 1
echo "📊 Checking logged data..."
RESPONSE=$(curl -s -H "X-API-Key: claude_api_secret_2024_change_me" \
    "http://localhost:3003/api/messages?session_id=$TEST_SESSION_ID&limit=1")

if echo "$RESPONSE" | grep -q "$TEST_CONTENT"; then
    echo "✅ Data logged successfully"
    echo "📋 Pretty printed response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ Data not found in logs"
    echo "📋 Response: $RESPONSE"
    exit 1
fi

echo ""
echo "🎉 All tests passed! Hook is working correctly."
echo "💡 The hook now includes improved token parsing for accurate usage statistics"
echo "💡 Check your ~/.claude/settings.json configuration for full setup"