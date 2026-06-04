# Examples — Tier 3

## 1. Multi-Step Workflow with Planning

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-001",
  "input": "Analyze our Q4 sales data, identify top 5 products by revenue, and create a summary report"
}
```

**Planning Phase** (internal):
```
Step 1: Fetch Q4 sales data (tool: query_database)
Step 2: Process and aggregate by product
Step 3: Sort by revenue, select top 5
Step 4: Generate summary report
Step 5: Return structured results
```

**Progress Events**:
```json
{"type": "progress", "data": {"step": 1, "total": 4, "message": "Fetching Q4 sales data..."}}
{"type": "tool", "data": {"tool_id": "query_database", "status": "completed"}}
{"type": "progress", "data": {"step": 2, "total": 4, "message": "Analyzing product performance..."}}
{"type": "progress", "data": {"step": 3, "total": 4, "message": "Generating report..."}}
{"type": "final", "data": {"request_id": "req-001"}}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-001",
  "status": "ok",
  "output": "## Q4 Sales Analysis Report\n\n### Top 5 Products by Revenue\n\n| Rank | Product | Revenue | Units Sold |\n|------|---------|---------|------------|\n| 1 | Widget Pro | $1.2M | 4,521 |\n| 2 | Gadget Plus | $980K | 3,890 |\n| 3 | Device Max | $750K | 2,100 |\n| 4 | Tool Elite | $620K | 5,230 |\n| 5 | Item Premium | $540K | 1,890 |\n\n### Key Insights\n- Total Q4 revenue: $8.2M\n- Top 5 products account for 49% of total revenue\n- Widget Pro showed 23% YoY growth",
  "structured_output": {
    "top_products": [
      {"rank": 1, "name": "Widget Pro", "revenue": 1200000, "units": 4521},
      {"rank": 2, "name": "Gadget Plus", "revenue": 980000, "units": 3890},
      {"rank": 3, "name": "Device Max", "revenue": 750000, "units": 2100},
      {"rank": 4, "name": "Tool Elite", "revenue": 620000, "units": 5230},
      {"rank": 5, "name": "Item Premium", "revenue": 540000, "units": 1890}
    ],
    "summary": {
      "total_revenue": 8200000,
      "top5_percentage": 49,
      "period": "Q4 2024"
    },
    "execution_summary": {
      "steps_completed": 4,
      "steps_total": 4,
      "tools_used": ["query_database"],
      "duration_ms": 3420
    }
  },
  "metadata": {
    "generated_at": "2025-01-01T00:00:00Z",
    "plan_executed": true
  }
}
```

## 2. Tool Orchestration with Dependencies

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-002",
  "input": "Check inventory for product SKU-123, if stock < 100, create a reorder request"
}
```

**Execution Plan**:
```
1. check_inventory(sku="SKU-123")
2. IF stock < 100: create_reorder_request(sku, quantity=200)
3. Return status
```

**Tool Calls**:
```json
// Step 1
{"tool": "check_inventory", "input": {"sku": "SKU-123"}}
// Result: {"stock": 45, "location": "Warehouse A"}

// Step 2 (condition met: 45 < 100)
{"tool": "create_reorder_request", "input": {"sku": "SKU-123", "quantity": 200}}
// Result: {"order_id": "RO-5678", "status": "pending_approval"}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-002",
  "status": "ok",
  "output": "Inventory check complete. SKU-123 has 45 units in stock (below threshold of 100). A reorder request has been created:\n\n- Order ID: RO-5678\n- Quantity: 200 units\n- Status: Pending approval\n\nThe request requires approval before processing.",
  "structured_output": {
    "inventory_check": {
      "sku": "SKU-123",
      "current_stock": 45,
      "threshold": 100,
      "below_threshold": true
    },
    "reorder_request": {
      "order_id": "RO-5678",
      "quantity": 200,
      "status": "pending_approval"
    },
    "execution_summary": {
      "steps_completed": 2,
      "tools_used": ["check_inventory", "create_reorder_request"],
      "conditional_branch": "reorder_triggered"
    }
  }
}
```

## 3. Error Recovery and Partial Success

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-003",
  "input": "Send notifications to all team leads about the upcoming meeting"
}
```

**Execution** (with partial failure):
```
1. get_team_leads() → ["alice@co.com", "bob@co.com", "carol@co.com"]
2. send_notification("alice@co.com") → ✓ Success
3. send_notification("bob@co.com") → ✗ Failed (invalid email)
4. send_notification("carol@co.com") → ✓ Success
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-003",
  "status": "ok",
  "output": "Notification delivery completed with partial success.\n\n**Delivered** (2/3):\n- alice@co.com ✓\n- carol@co.com ✓\n\n**Failed** (1/3):\n- bob@co.com - Invalid email address\n\nConsider updating Bob's contact information and retrying.",
  "structured_output": {
    "delivery_summary": {
      "total": 3,
      "succeeded": 2,
      "failed": 1
    },
    "results": [
      {"email": "alice@co.com", "status": "delivered"},
      {"email": "bob@co.com", "status": "failed", "error": "invalid_email"},
      {"email": "carol@co.com", "status": "delivered"}
    ]
  },
  "metadata": {
    "partial_success": true,
    "retry_available": true,
    "failed_recipients": ["bob@co.com"]
  }
}
```

## 4. Budget-Constrained Operation

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-004",
  "input": "Analyze sentiment for all 10,000 customer reviews from last month"
}
```

**Planning** (budget check):
```
Estimated tokens: ~2,000,000 input + ~100,000 output
Estimated cost: $4.20
Budget limit: $0.05 per task
Status: EXCEEDS BUDGET
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "code": "budget_exceeded",
  "message": "This operation would exceed the cost budget. Estimated cost: $4.20, Budget: $0.05",
  "retryable": false,
  "details": {
    "estimated_cost_usd": 4.20,
    "budget_usd": 0.05,
    "record_count": 10000,
    "alternatives": [
      "Analyze a sample of 100 reviews (est. $0.04)",
      "Analyze reviews from a specific date range",
      "Request budget increase for full analysis"
    ]
  }
}
```

## 5. Approval Gate

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-005",
  "input": "Delete all expired user sessions from the database"
}
```

**Output** (destructive operation detected):
```json
{
  "contract_version": "1.0.0",
  "code": "approval_required",
  "message": "This operation requires explicit approval before execution.",
  "retryable": false,
  "details": {
    "operation": "delete_sessions",
    "side_effect_level": "destructive",
    "impact_estimate": {
      "records_affected": 15420,
      "tables": ["user_sessions"]
    },
    "approval_requirements": {
      "mode": "human_required",
      "reason": "Destructive database operation"
    },
    "preview_query": "DELETE FROM user_sessions WHERE expires_at < NOW()",
    "rollback_available": false
  }
}
```

## 6. Complex Conditional Logic

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-006",
  "input": "Process this order: validate items, check inventory, apply discounts, calculate shipping, and confirm"
}
```

**Execution Plan**:
```
1. validate_order_items()
   └─ IF invalid → Return error
2. check_inventory_all()
   └─ IF any out of stock → Return availability error
3. apply_discounts()
4. calculate_shipping()
5. create_order_confirmation()
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-006",
  "status": "ok",
  "output": "Order processed successfully!\n\n**Order Summary**\n- Items: 3 products validated ✓\n- Inventory: All items in stock ✓\n- Subtotal: $149.99\n- Discount (SAVE10): -$15.00\n- Shipping (Standard): $5.99\n- **Total: $140.98**\n\nConfirmation #: ORD-98765",
  "structured_output": {
    "order": {
      "confirmation_id": "ORD-98765",
      "items_count": 3,
      "subtotal": 149.99,
      "discount": {"code": "SAVE10", "amount": 15.00},
      "shipping": {"method": "Standard", "cost": 5.99},
      "total": 140.98
    },
    "execution_trace": [
      {"step": "validate_order_items", "status": "passed"},
      {"step": "check_inventory_all", "status": "passed"},
      {"step": "apply_discounts", "status": "applied", "discount": 15.00},
      {"step": "calculate_shipping", "status": "calculated", "cost": 5.99},
      {"step": "create_order_confirmation", "status": "created", "id": "ORD-98765"}
    ]
  }
}
```
