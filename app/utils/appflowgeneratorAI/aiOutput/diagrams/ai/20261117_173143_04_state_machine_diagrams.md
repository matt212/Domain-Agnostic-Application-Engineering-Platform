# State Machine Diagrams

Business-object lifecycles: object states, transitions, guards and abnormal endings.

Dashed outlines and elements marked * were added by AI. Solid elements come from the repositories.

Generated 2026-11-17T12:06:14.756Z by 8.0.13.DiagramsAI.js using unsloth/Qwen3.5-9B-GGUF. Sources: knowledge base (10 actors, 14 business objects, 11 activities, 11 lifecycle stages, 20 information requirements), requirements schema (62 functional, 28 business requirements), business_rule_discovery (142 rules after merging 168 raw rules, ingestion run 3).

| Unit | Covers | Source | New elements |
|---|---|---|---|
| STATE-1 | Service Area Definition, Store Partner Agreement, Product... | AI complete | 27 |
| STATE-2 | Customer Profile, Order Request, Fulfillment Task and 2 more | AI complete | 46 |
| STATE-3 | Financial Transaction Record, Delivery Proof, Feedback Re... | AI complete | 36 |

## Service Area Definition

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Approved *" as S_s2
  state "Inactive *" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Market Entry and Partner Onboarding *
  S_s2 --> S_s3: Market Entry and Partner Onboarding *
  S_s3 --> [*]
```

## Store Partner Agreement

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Active *" as S_s2
  state "Suspended *" as S_s3
  state "Terminated *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Market Entry and Partner Onboarding *
  S_s2 --> S_s3: Market Entry and Partner Onboarding *
  S_s3 --> S_s4: Market Entry and Partner Onboarding *
  S_s2 --> S_s4: Market Entry and Partner Onboarding *
  S_s4 --> [*]
```

## Product Catalog

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Published *" as S_s2
  state "Archived *" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Product Catalog Curation and Strategy *
  S_s2 --> S_s3: Product Catalog Curation and Strategy *
  S_s3 --> [*]
```

## Real-Time Inventory Snapshot

Source: AI complete

```mermaid
stateDiagram-v2
  state "Valid *" as S_s1
  state "Stale *" as S_s2
  [*] --> S_s1
  S_s1 --> S_s2: Inventory Synchronization and Validation *
  S_s2 --> S_s1: Inventory Synchronization and Validation *
  S_s1 --> [*]
```

## Delivery Zone Map

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Active *" as S_s2
  state "Deprecated *" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Order Validation and Resource Allocation *
  S_s2 --> S_s3: Order Validation and Resource Allocation *
  S_s3 --> [*]
```

## Customer Profile

Source: AI complete

```mermaid
stateDiagram-v2
  state "Created *" as S_s1
  state "Active *" as S_s2
  state "Suspended *" as S_s3
  state "Archived *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Customer Registration Event *
  S_s2 --> S_s3: Violation of Terms Event *
  S_s3 --> S_s2: Compliance Resolution Event *
  S_s2 --> S_s4: Long-term Inactivity Event *
  S_s4 --> [*]
```

## Order Request

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Validated *" as S_s2
  state "Rejected *" as S_s3
  state "Cancelled *" as S_s4
  state "Confirmed *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Order Validation Event *
  S_s2 --> S_s5: Resource Allocation Event *
  S_s2 --> S_s3: Validation Failure Event *
  S_s2 --> S_s4: Customer Cancellation Event *
  S_s5 --> S_s4: Customer Cancellation Event *
  S_s3 --> [*]
  S_s4 --> [*]
```

## Fulfillment Task

Source: AI complete

```mermaid
stateDiagram-v2
  state "Created *" as S_s1
  state "Assigned *" as S_s2
  state "In Progress *" as S_s3
  state "Completed *" as S_s4
  state "Failed *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Staff Assignment Event *
  S_s2 --> S_s3: Task Start Event *
  S_s3 --> S_s4: Task Completion Event *
  S_s3 --> S_s5: Task Failure Event *
  S_s1 --> S_s5: Creation Failure Event *
  S_s4 --> [*]
  S_s5 --> [*]
```

## Assigned Delivery Slot

Source: AI complete

```mermaid
stateDiagram-v2
  state "Requested *" as S_s1
  state "Confirmed *" as S_s2
  state "Expired *" as S_s3
  state "Cancelled *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Slot Confirmation Event *
  S_s2 --> S_s3: Time Window Expiry Event *
  S_s2 --> S_s4: Customer Cancellation Event *
  S_s1 --> S_s4: Request Withdrawal Event *
  S_s3 --> [*]
  S_s4 --> [*]
```

## Delivery Assignment

Source: AI complete

```mermaid
stateDiagram-v2
  state "Created *" as S_s1
  state "Active *" as S_s2
  state "In Transit *" as S_s3
  state "Delivered *" as S_s4
  state "Returned *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Agent Acceptance Event *
  S_s2 --> S_s3: Dispatch Event *
  S_s3 --> S_s4: Handover Event *
  S_s3 --> S_s5: Delivery Failure Event *
  S_s2 --> S_s5: Delivery Failure Event *
  S_s4 --> [*]
  S_s5 --> [*]
```

## Financial Transaction Record

Source: AI complete

```mermaid
stateDiagram-v2
  state "Pending *" as S_s1
  state "Authorized *" as S_s2
  state "Settled *" as S_s3
  state "Failed *" as S_s4
  state "Refunded *" as S_s5
  state "Disputed *" as S_s6
  [*] --> S_s1
  S_s1 --> S_s2: Payment Initiated *
  S_s2 --> S_s3: Funds Cleared *
  S_s3 --> S_s5: Return Initiated *
  S_s3 --> S_s4: Payment Reversal *
  S_s3 --> S_s6: Dispute Opened *
  S_s6 --> S_s3: Dispute Resolved *
  S_s6 --> S_s4: Dispute Abandoned *
  S_s3 --> [*]
  S_s5 --> [*]
  S_s4 --> [*]
```

## Delivery Proof

Source: AI complete

```mermaid
stateDiagram-v2
  state "Not Generated *" as S_s1
  state "Verified *" as S_s2
  state "Invalidated *" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Proof Accepted by System *
  S_s1 --> S_s3: Handover Disputed or Failed *
  S_s2 --> [*]
  S_s3 --> [*]
```

## Feedback Record

Source: AI complete

```mermaid
stateDiagram-v2
  state "Not Collected *" as S_s1
  state "Submitted *" as S_s2
  state "Processed *" as S_s3
  state "Archived *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Customer Provides Input *
  S_s2 --> S_s3: System Analyzes Content *
  S_s3 --> S_s4: Feedback Stored for Analysis *
  S_s4 --> [*]
```

## Dispute Ticket

Source: AI complete

```mermaid
stateDiagram-v2
  state "Open *" as S_s1
  state "Investigating *" as S_s2
  state "Resolved *" as S_s3
  state "Escalated *" as S_s4
  state "Closed *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Issue Assigned to Agent *
  S_s2 --> S_s3: Issue Resolved by Agent *
  S_s2 --> S_s4: Issue Requires Senior Review *
  S_s3 --> S_s5: Ticket Archived *
  S_s4 --> S_s3: Issue Resolved by Senior Agent *
  S_s4 --> S_s5: Escalation Process Completed *
  S_s5 --> [*]
```

