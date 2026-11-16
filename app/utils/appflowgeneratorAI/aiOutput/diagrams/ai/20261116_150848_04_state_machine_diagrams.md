# State Machine Diagrams

Lifecycle of each business object: states, transitions, guards and abnormal endings.

Dashed outlines and elements marked * were added by the AI model (inferred); solid ones come from the repositories.

Generated 2026-11-16T09:47:55.699Z by 8.5.2.DiagramsAI.js using unsloth/Qwen3.5-9B-GGUF. Sources: knowledge base (10 actors, 14 business objects, 11 activities, 11 lifecycle stages, 20 information requirements), requirements schema (62 functional, 28 business requirements), business_rule_discovery (142 rules after merging 168 raw rules, ingestion run 3).

| Unit | Covers | Source | New elements |
|---|---|---|---|
| STATE-1 | Service Area Definition, Store Partner Agreement, Product... | baseline (not generated yet) | 0 |
| STATE-2 | Customer Profile, Order Request, Fulfillment Task and 2 more | baseline (not generated yet) | 0 |
| STATE-3 | Financial Transaction Record, Delivery Proof, Feedback Re... | baseline (not generated yet) | 0 |

## Store Partner Agreement

```mermaid
stateDiagram-v2
  state "Foundation Establishment" as S_s1
  state "Business Decision" as S_s2
  [*] --> S_s1
  S_s1 --> S_s2: Product Catalog Curation and Strategy
  S_s2 --> [*]
  note right of S_s1 : The system must not assign an order to a Store Partner if the Real-Time Inventory Snaps...
  note right of S_s1 : The system must reject an Order Request submission if the sum of item prices is strictl...
```

## Product Catalog

```mermaid
stateDiagram-v2
  state "Supply Chain Integration" as S_s1
  state "Order Initiation" as S_s2
  state "Business Decision" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Order Initiation and Demand Capture [Discontinued Item Blocking]
  S_s2 --> S_s3: Product Catalog Curation and Strategy
  S_s3 --> [*]
  note right of S_s1 : An Order Request must not be successfully created if it contains any item where the cur...
  note right of S_s1 : The system must reject an Order Request submission if the sum of item prices is strictl...
```

## Real-Time Inventory Snapshot

```mermaid
stateDiagram-v2
  state "Supply Chain Integration" as S_s1
  state "Order Validation and Allocation" as S_s2
  [*] --> S_s1
  S_s1 --> S_s2: Order Validation and Resource Allocation [Allocation Eligibility Threshold]
  S_s2 --> [*]
  note right of S_s1 : The system must not assign an order to a Store Partner if the Real-Time Inventory Snaps...
  note right of S_s1 : The system must flag a synchronization discrepancy if the data link latency exceeds the...
```

## Delivery Zone Map

```mermaid
stateDiagram-v2
  state "Operational Readiness" as S_s1
  state "Order Validation and Allocation" as S_s2
  [*] --> S_s1
  S_s1 --> S_s2: Order Validation and Resource Allocation [Geographic Boundary Integrity]
  S_s2 --> [*]
  note right of S_s1 : The system must reject new Assigned Delivery Slot requests when demand exceeds supply i...
```

## Customer Profile

```mermaid
stateDiagram-v2
  state "Order Initiation" as S_s1
  state "Financial Settlement" as S_s2
  [*] --> S_s1
  S_s1 --> S_s2: Payment Processing and Financial Sett...
  S_s2 --> [*]
  note right of S_s1 : A Customer Profile must not be activated if the provided contact details do not exactly...
  note right of S_s1 : All critical notifications regarding Order Request status or Payment Settlement must be...
```

## Order Request

```mermaid
stateDiagram-v2
  state "Order Initiation" as S_s1
  state "Order Validation and Allocation" as S_s2
  state "Immediate Order Locking on Failure" as S_x1
  state "Primary Provider Failure Fallback" as S_x2
  [*] --> S_s1
  S_s1 --> S_s2: Order Validation and Resource Allocation [Expiry-Flagged Item Rejection]
  S_s1 --> S_x1: rule broken [The business risks overselling invent...]
  S_s2 --> S_x2: rule broken [the system proceeds with a failed all...]
  S_s2 --> [*]
  S_x1 --> [*]
  S_x2 --> [*]
  note right of S_s1 : An Order Request must not be successfully created if it contains any item where the cur...
  note right of S_s1 : The system must not assign an order to a Store Partner if the Real-Time Inventory Snaps...
```

## Fulfillment Task

```mermaid
stateDiagram-v2
  state "Order Validation and Allocation" as S_s1
  state "Order Preparation" as S_s2
  state "Last-Mile Delivery" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Order Fulfillment and Preparation [Atomic Inventory Locking]
  S_s2 --> S_s3: Last-Mile Logistics Execution [Slot Validity on Route Constraint]
  S_s3 --> [*]
  note right of S_s1 : If a quality check fails for any item, the Fulfillment Task must be flagged as 'Require...
  note right of S_s1 : Inventory locks must be released immediately upon confirmation of cancellation before t...
```

## Assigned Delivery Slot

```mermaid
stateDiagram-v2
  state "Order Validation and Allocation" as S_s1
  state "Order Initiation" as S_s2
  state "Order Validation and Allocation" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Order Initiation and Demand Capture
  S_s2 --> S_s3: Order Validation and Resource Allocation [Agent Capacity Enforcement]
  S_s3 --> [*]
  note right of S_s1 : The system must invalidate an Assigned Delivery Slot if external network data indicates...
  note right of S_s1 : The system must reject new Assigned Delivery Slot requests when demand exceeds supply i...
```

## Delivery Assignment

```mermaid
stateDiagram-v2
  state "Order Validation and Allocation" as S_s1
  state "Order Preparation" as S_s2
  state "Last-Mile Delivery" as S_s3
  state "Handover and Confirmation" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Order Fulfillment and Preparation
  S_s2 --> S_s3: Last-Mile Logistics Execution [Feedback Assignment Binding]
  S_s3 --> S_s4: Delivery Handover and Proof Generation [External Proof Verification Standard]
  S_s4 --> [*]
  note right of S_s1 : A Delivery Proof must not be accepted or processed if the associated Delivery Assignmen...
  note right of S_s1 : A Delivery Assignment must not transition to an active state until the assigned Deliver...
```

## Financial Transaction Record

```mermaid
stateDiagram-v2
  state "Financial Settlement" as S_s1
  state "Post-Transaction Review" as S_s2
  state "Tax Dispute Auto-Trigger" as S_x1
  state "Dispute Escalation Trigger" as S_x2
  [*] --> S_s1
  S_s1 --> S_s2: Dispute Resolution and Exception Hand... [Dispute-Linked Settlement Hold]
  S_s1 --> S_x1: rule broken [A formal dispute record is created to...]
  S_s1 --> S_x2: rule broken [the system pauses automatic penalty d...]
  S_s2 --> [*]
  S_x1 --> [*]
  S_x2 --> [*]
  note right of S_s1 : A financial transaction record must be linked to verifiable evidence of delivery before...
  note right of S_s1 : The system must prevent the finalization of a Financial Transaction Record if no valid ...
```

## Dispute Ticket

```mermaid
stateDiagram-v2
  state "Lifecycle Conclusion" as S_s1
  state "Post-Transaction Review" as S_s2
  state "Tax Dispute Auto-Trigger" as S_x1
  state "Dispute Ticket Auto-Generation on Mis..." as S_x2
  [*] --> S_s1
  S_s1 --> S_s2: Dispute Resolution and Exception Hand... [Dispute Creation Trigger]
  S_s2 --> S_x1: rule broken [A formal dispute record is created to...]
  S_s2 --> S_x2: rule broken [The Order Request remains in a pendin...]
  S_s2 --> [*]
  S_x1 --> [*]
  S_x2 --> [*]
  note right of S_s1 : An actor must not approve a Dispute Ticket where they are the accused party or the part...
  note right of S_s1 : Disputes regarding product quality must be approved by the Store Partner.
```

