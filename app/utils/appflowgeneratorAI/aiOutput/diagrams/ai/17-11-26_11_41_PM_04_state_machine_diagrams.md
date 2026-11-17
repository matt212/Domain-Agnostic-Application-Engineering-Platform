# State Machine Diagrams

Business-object lifecycles: object states, transitions, guards and abnormal endings.

Dashed outlines and elements marked * were added by AI. Solid elements come from the repositories.

Generated 2026-11-17T18:18:20.523Z by 8.0.13.DiagramsAI.js using unsloth/Qwen3.5-9B-GGUF. Sources: knowledge base (10 actors, 14 business objects, 11 activities, 11 lifecycle stages, 20 information requirements), requirements schema (62 functional, 28 business requirements), business_rule_discovery (142 rules after merging 168 raw rules, ingestion run 3).

| Unit | Covers | Source | New elements |
|---|---|---|---|
| STATE-1 | Service Area Definition, Store Partner Agreement, Product... | AI complete | 47 |
| STATE-2 | Customer Profile, Order Request, Fulfillment Task and 2 more | AI complete | 38 |
| STATE-3 | Financial Transaction Record, Delivery Proof, Feedback Re... | AI complete | 32 |

## Service Area Definition

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Active *" as S_s2
  state "Suspended *" as S_s3
  state "Archived *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Store and Delivery Partner onboarding... *
  S_s2 --> S_s3: Market entry review failed or operati... *
  S_s3 --> S_s2: Operational constraints resolved and ... *
  S_s2 --> S_s4: Market exit or strategic zone deactiv... *
  S_s4 --> [*]
```

## Store Partner Agreement

Source: AI complete

```mermaid
stateDiagram-v2
  state "Negotiation *" as S_s1
  state "Pending Signature *" as S_s2
  state "Active *" as S_s3
  state "Terminated *" as S_s4
  state "Expired *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Terms and conditions agreed upon by b... *
  S_s2 --> S_s3: Counterparties have signed the agreement *
  S_s3 --> S_s4: Mutual termination or breach of contract *
  S_s3 --> S_s5: Agreement term has concluded without ... *
  S_s4 --> S_s5: Termination date passed *
  S_s4 --> [*]
  S_s5 --> [*]
```

## Product Catalog

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Under Review *" as S_s2
  state "Active *" as S_s3
  state "Deprecated *" as S_s4
  state "Archived *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Product catalog curation and strategy... *
  S_s2 --> S_s3: Catalog curation and strategy review ... *
  S_s3 --> S_s4: Product is no longer supported but da... *
  S_s4 --> S_s5: Product is permanently removed from s... *
  S_s3 --> S_s4: Inventory synchronization and validat... *
  S_s5 --> [*]
```

## Real-Time Inventory Snapshot

Source: AI complete

```mermaid
stateDiagram-v2
  state "Initialized *" as S_s1
  state "Valid *" as S_s2
  state "Stale *" as S_s3
  state "Reconciled *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Inventory synchronization and validat... *
  S_s2 --> S_s3: Time threshold exceeded without update *
  S_s2 --> S_s4: Discrepancies resolved and data corre... *
  S_s3 --> S_s2: New synchronization cycle completes s... *
  S_s3 --> S_s2: Data integrity check fails on stale data *
  S_s2 --> [*]
```

## Delivery Zone Map

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Calculated *" as S_s2
  state "Active *" as S_s3
  state "Outdated *" as S_s4
  state "Invalidated *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Geographic boundaries and travel time... *
  S_s2 --> S_s3: Map is approved for fee calculation a... *
  S_s3 --> S_s4: Travel time estimates or boundaries n... *
  S_s4 --> S_s3: Map data refreshed and validated *
  S_s3 --> S_s5: Store location changed or service are... *
  S_s5 --> [*]
```

## Customer Profile

Source: AI complete

```mermaid
stateDiagram-v2
  state "Inactive *" as S_s1
  state "Suspended *" as S_s2
  [*] --> S_s1
  S_s1 --> S_s2: Payment Method Invalidated or Fraud D... *
  S_s2 --> S_s1: Payment Method Validated and Fraud Cl... *
  S_s2 --> [*]
```

## Order Request

Source: AI complete

```mermaid
stateDiagram-v2
  state "Draft *" as S_s1
  state "Validated *" as S_s2
  state "Rejected *" as S_s3
  state "Confirmed *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Inventory Availability Confirmed and ... *
  S_s1 --> S_s3: Item Unavailable or Address Invalid *
  S_s2 --> S_s4: Payment Authorized and Slot Secured *
  S_s4 --> S_s3: Payment Declined or Slot Conflict Res... *
  S_s3 --> [*]
  S_s4 --> [*]
```

## Fulfillment Task

Source: AI complete

```mermaid
stateDiagram-v2
  state "Pending *" as S_s1
  state "Picking *" as S_s2
  state "Packed *" as S_s3
  state "Dispatched *" as S_s4
  state "Completed *" as S_s5
  [*] --> S_s1
  S_s1 --> S_s2: Order Confirmed and Task Assigned *
  S_s2 --> S_s3: Items Collected and Verified *
  S_s3 --> S_s4: Package Sealed and Handed to Courier *
  S_s2 --> S_s5: Cancelled by Customer or System *
  S_s3 --> S_s5: Cancelled by Customer or System *
  S_s5 --> [*]
```

## Assigned Delivery Slot

Source: AI complete

```mermaid
stateDiagram-v2
  state "Available *" as S_s1
  state "Booked *" as S_s2
  state "Confirmed *" as S_s3
  state "Cancelled *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Order Request Confirmed with Time Pre... *
  S_s2 --> S_s3: Delivery Agent Assigned *
  S_s2 --> S_s4: Customer Cancellation or Agent Unavai... *
  S_s3 --> S_s4: Delivery Agent Reassignment or Order ... *
  S_s3 --> [*]
  S_s4 --> [*]
```

## Delivery Assignment

Source: AI complete

```mermaid
stateDiagram-v2
  state "Unassigned *" as S_s1
  state "In-Transit *" as S_s2
  state "Delivered *" as S_s3
  state "Failed *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Agent Picks Up Package *
  S_s2 --> S_s3: Package Handed Over to Customer *
  S_s2 --> S_s4: Delivery Attempt Unsuccessful or Cust... *
  S_s4 --> S_s3: Customer Accepts Package After Delay *
  S_s3 --> [*]
  S_s4 --> [*]
```

## Financial Transaction Record

Source: AI complete

```mermaid
stateDiagram-v2
  state "Unsettled *" as S_s1
  state "Disputed *" as S_s2
  state "Refunded *" as S_s3
  [*] --> S_s1
  S_s1 --> S_s2: Dispute Initiated [Customer reports transaction issue] *
  S_s1 --> S_s3: Refund Approved [Merchant or system initiates reversal] *
  S_s2 --> S_s1: Dispute Resolved in Favor of Merchant [Evidence validates transaction legiti...] *
  S_s2 --> S_s3: Dispute Resolved in Favor of Customer [Transaction voided due to error] *
  S_s1 --> [*]
  S_s3 --> [*]
```

## Delivery Proof

Source: AI complete

```mermaid
stateDiagram-v2
  state "Pending *" as S_s1
  state "Generated *" as S_s2
  state "Verified *" as S_s3
  state "Invalidated *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Handover Completed [Courier confirms delivery with custom...] *
  S_s2 --> S_s3: Proof Confirmed [System validates proof authenticity a...] *
  S_s2 --> S_s4: Proof Rejected [Proof fails validation criteria or is...] *
  S_s4 --> S_s2: Proof Resubmitted [New proof generated after rejection] *
  S_s3 --> [*]
  S_s4 --> [*]
```

## Feedback Record

Source: AI complete

```mermaid
stateDiagram-v2
  state "Drafted *" as S_s1
  state "Submitted *" as S_s2
  state "Processed *" as S_s3
  state "Archived *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Customer Submits Feedback [Customer completes rating and comment...] *
  S_s2 --> S_s3: Feedback Validated [System checks for completeness and spam] *
  S_s3 --> S_s4: Feedback Stored [Record saved for quality improvement ...] *
  S_s2 --> S_s1: Feedback Withdrawn [Customer cancels submission before fi...] *
  S_s4 --> [*]
```

## Dispute Ticket

Source: AI complete

```mermaid
stateDiagram-v2
  state "Open *" as S_s1
  state "Investigating *" as S_s2
  state "Resolved *" as S_s3
  state "Closed *" as S_s4
  [*] --> S_s1
  S_s1 --> S_s2: Issue Reported [Customer or agent logs a specific exc...] *
  S_s1 --> S_s4: Issue Dismissed [Issue deemed invalid or outside scope] *
  S_s2 --> S_s3: Issue Resolved [Problem fixed or compensation agreed ...] *
  S_s3 --> S_s4: Ticket Finalized [Resolution confirmed and ticket archived] *
  S_s2 --> S_s1: Investigation Reset [New evidence requires reopening the case] *
  S_s4 --> [*]
```

