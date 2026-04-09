#!/bin/bash
# Test diverse scenarios with qwen3-coder

echo "=========================================="
echo "DIVERSE SCENARIO TESTING"
echo "Model: qwen3-coder:latest"
echo "=========================================="

run_test() {
    local name="$1"
    local file="$2"
    local query="$3"

    echo ""
    echo "----------------------------------------"
    echo "TEST: $name"
    echo "File: $file"
    echo "Query: $query"
    echo "----------------------------------------"

    result=$(npx tsx src/index.ts "$query" "$file" 2>&1 | tail -5)
    echo "$result"
}

# Test 1: Sales data totals
run_test "Sales Total" \
    "test-fixtures/scattered-data.txt" \
    "What is the total of all sales data values?"

# Test 2: Server logs - count errors
run_test "Count Errors" \
    "test-fixtures/server-logs.txt" \
    "How many ERROR entries are there?"

# Test 3: Server logs - find specific errors
run_test "Webhook Failures" \
    "test-fixtures/server-logs.txt" \
    "Find all failed webhook deliveries"

# Test 4: Sensor readings - critical alerts
run_test "Critical Sensors" \
    "test-fixtures/sensor-readings.txt" \
    "Which sensors have CRITICAL status?"

# Test 5: Sensor readings - temperature average
run_test "Lab Temperatures" \
    "test-fixtures/sensor-readings.txt" \
    "What are the temperature readings for LAB sensors?"

# Test 6: Inventory - out of stock
run_test "Out of Stock" \
    "test-fixtures/inventory-report.txt" \
    "Which items are OUT_OF_STOCK?"

# Test 7: Inventory - low stock count
run_test "Low Stock Count" \
    "test-fixtures/inventory-report.txt" \
    "How many items have LOW_STOCK status?"

# Test 8: Simple text search
run_test "Moby Dick - Whale" \
    "test-fixtures/moby-dick-excerpt.txt" \
    "How many times is 'whale' mentioned?"

# Test 9: Code analysis
run_test "Code Functions" \
    "test-fixtures/sample-code.ts" \
    "What functions are defined in this code?"

# Test 10: Article summary
run_test "Article Topic" \
    "test-fixtures/short-article.txt" \
    "What is this article about?"

echo ""
echo "=========================================="
echo "TESTING COMPLETE"
echo "=========================================="
