# Sequence Diagrams

Interactions between actors and system participants over time. Scenarios are derived from the data: groups of lifecycle stages, plus one for the exception rules.

Solid arrow: an activity handed from the primary actor to a supporting actor. Dashed arrow: an information flow. alt blocks: a business rule and what happens when it is broken.

Generated 2026-11-19T07:25:23.325Z by 8.5.1.DiagramsDeterministic.js (no AI). Sources: knowledge base (10 actors, 14 business objects, 11 activities, 11 lifecycle stages, 20 information requirements), requirements schema (62 functional, 28 business requirements), business_rule_discovery (142 rules after merging 168 raw rules, ingestion run 3).

## Scenario 1: Foundation Establishment to Last-Mile Delivery

```mermaid
sequenceDiagram
  autonumber
  actor P_p1 as Platform Operator
  actor P_p2 as Regulatory Authority
  actor P_p3 as Merchandiser
  actor P_p4 as Customer
  actor P_p5 as Store Partner
  participant P_p6 as Order Allocation Engine
  actor P_p7 as Fulfillment Supervisor
  actor P_p8 as Delivery Partner
  Note over P_p1: Foundation Establishment
  P_p1->>P_p2: Market Entry and Partner Onboarding: Validated Service Zones
  P_p1->>P_p3: Market Entry and Partner Onboarding: Validated Service Zones
  P_p1-->>P_p4: Geospatial Service Boundary Definition
  P_p5-->>P_p1: Commercial Partnership Terms and Service Level ...
  alt Regulatory Zone Activation Gate
  Note over P_p1: Continue to the next step
  else Rule violated
  Note over P_p1: The system blocks the activation of the zone and prevents any order...
  end
  Note over P_p1: Supply Chain Integration
  P_p1->>P_p5: Inventory Synchronization and Validation: Verified Inventory Status
  P_p1->>P_p6: Inventory Synchronization and Validation: Verified Inventory Status
  P_p5-->>P_p4: Real-Time Stock Availability and Status
  P_p5-->>P_p1: Inventory Synchronization Health Metrics
  alt Sync Discrepancy Flagging
  Note over P_p1: Continue to the next step
  else Rule violated
  Note over P_p1: The system halts order processing for affected stores and alerts th...
  end
  Note over P_p4: Order Initiation
  P_p4->>P_p4: Order Initiation and Demand Capture
  P_p5-->>P_p4: Real-Time Stock Availability and Status
  P_p5-->>P_p4: Aggregated Product Catalog and Pricing
  alt Discontinued Item Blocking
  Note over P_p4: Continue to the next step
  else Rule violated
  Note over P_p4: The system blocks the item selection and displays a 'Product Unavai...
  end
  Note over P_p6: Order Validation and Allocation
  P_p6->>P_p1: Order Validation and Resource Allocation: Confirmed Order Assignment
  P_p5-->>P_p1: Commercial Partnership Terms and Service Level ...
  P_p5-->>P_p4: Real-Time Stock Availability and Status
  alt Explicit Acceptance Required
  Note over P_p6: Continue to the next step
  else Rule violated
  Note over P_p6: The system blocks the start of the delivery task and prevents proof...
  end
  Note over P_p5: Order Preparation
  P_p5->>P_p3: Order Fulfillment and Preparation: Completed Fulfillment Task
  P_p5->>P_p7: Order Fulfillment and Preparation: Completed Fulfillment Task
  P_p4-->>P_p6: Order Composition and Delivery Instructions
  P_p5-->>P_p6: Fulfillment Task Allocation and Routing
  alt Quality Failure Blocking
  Note over P_p5: Continue to the next step
  else Rule violated
  Note over P_p5: The system must prevent any further status changes or dispatch acti...
  end
  Note over P_p8: Last-Mile Delivery
  P_p8->>P_p6: Last-Mile Logistics Execution: In-Transit Status
  P_p1-->>P_p4: Geospatial Service Boundary Definition
  P_p4-->>P_p6: Customer Identity and Contact Information
  alt Mandatory Status Notification Trigger
  Note over P_p8: Continue to the next step
  else Rule violated
  Note over P_p8: Customer support inquiries increase and customer retention rates de...
  end
```

## Scenario 2: Handover & Confirmation to Business Decision

```mermaid
sequenceDiagram
  autonumber
  actor P_p1 as Delivery Partner
  actor P_p2 as Customer
  participant P_p3 as Order Allocation Engine
  actor P_p4 as Platform Operator
  actor P_p5 as Payment Provider
  actor P_p6 as Store Partner
  actor P_p7 as Merchandiser
  Note over P_p1: Handover and Confirmation
  P_p1->>P_p2: Delivery Handover and Proof Generation: Signed/Photo Delivery Proof
  P_p2-->>P_p3: Customer Identity and Contact Information
  P_p2-->>P_p4: Proof of Delivery (POD) Evidence
  alt Delivery Proof Rejection for Cancelled Assignments
  Note over P_p1: Continue to the next step
  else Rule violated
  Note over P_p1: The system rejects the submission and logs an error, preventing fal...
  end
  Note over P_p5: Financial Settlement
  P_p5->>P_p4: Payment Processing and Financial Settlement: Processed Payment
  P_p5->>P_p6: Payment Processing and Financial Settlement: Processed Payment
  P_p2-->>P_p3: Customer Identity and Contact Information
  P_p2-->>P_p4: Proof of Delivery (POD) Evidence
  alt Delivery Verification Mandate
  Note over P_p5: Continue to the next step
  else Rule violated
  Note over P_p5: The settlement status remains 'Pending' and funds are withheld unti...
  end
  Note over P_p2: Post-Transaction Review
  P_p2->>P_p4: Post-Transaction Review and Feedback Collection: Customer Ratings a...
  P_p2-->>P_p4: Customer Satisfaction and Quality Feedback
  P_p2-->>P_p4: Exception and Dispute Ticket Registry
  alt Feedback Assignment Binding
  Note over P_p2: Continue to the next step
  else Rule violated
  Note over P_p2: The feedback is rejected or logged as 'Unattributed', preventing ac...
  end
  P_p4->>P_p2: Dispute Resolution and Exception Handling: Resolved Dispute
  P_p4->>P_p6: Dispute Resolution and Exception Handling: Resolved Dispute
  P_p6-->>P_p2: Financial Transaction Ledger
  P_p2-->>P_p4: Customer Satisfaction and Quality Feedback
  alt Refund Precondition
  Note over P_p4: Continue to the next step
  else Rule violated
  Note over P_p4: Revenue leakage or incorrect financial reporting occurs
  end
  Note over P_p7: Business Decision
  P_p7->>P_p7: Product Catalog Curation and Strategy
  P_p6-->>P_p4: Commercial Partnership Terms and Service Level ...
  P_p6-->>P_p2: Real-Time Stock Availability and Status
  alt Perishable Expiry Enforcement
  Note over P_p7: Continue to the next step
  else Rule violated
  Note over P_p7: The system rejects the Order Request and logs a compliance error fo...
  end
```

## Scenario 3: Exception paths: Dispute Ticket and Financial Transaction Record

```mermaid
sequenceDiagram
  autonumber
  actor P_p1 as Platform Operator
  actor P_p2 as Regulatory Authority
  actor P_p3 as Merchandiser
  actor P_p4 as Customer
  actor P_p5 as Store Partner
  participant P_p6 as Order Allocation Engine
  actor P_p7 as Delivery Partner
  Note over P_p1: Foundation Establishment
  P_p1->>P_p2: Market Entry and Partner Onboarding: Validated Service Zones
  P_p1->>P_p3: Market Entry and Partner Onboarding: Validated Service Zones
  P_p1-->>P_p4: Geospatial Service Boundary Definition
  P_p5-->>P_p1: Commercial Partnership Terms and Service Level ...
  alt Regulatory License Anomaly Escalation
  Note over P_p1: Continue to the next step
  else Rule violated
  Note over P_p1: The business risks accepting orders from unlicensed partners, leadi...
  end
  Note over P_p1: Supply Chain Integration
  P_p1->>P_p5: Inventory Synchronization and Validation: Verified Inventory Status
  P_p1->>P_p6: Inventory Synchronization and Validation: Verified Inventory Status
  P_p5-->>P_p4: Real-Time Stock Availability and Status
  P_p5-->>P_p1: Inventory Synchronization Health Metrics
  alt Immediate Order Locking on Failure
  Note over P_p1: Continue to the next step
  else Rule violated
  Note over P_p1: The business risks overselling inventory, causing order fulfillment...
  end
  Note over P_p7: Handover and Confirmation
  P_p7->>P_p4: Delivery Handover and Proof Generation: Signed/Photo Delivery Proof
  P_p4-->>P_p6: Customer Identity and Contact Information
  P_p4-->>P_p1: Proof of Delivery (POD) Evidence
  alt Dispute Ticket Auto-Generation on Missing Proof
  Note over P_p7: Continue to the next step
  else Rule violated
  Note over P_p7: The Order Request remains in a pending state, blocking closure and ...
  end
  Note over P_p1: Post-Transaction Review
  P_p1->>P_p4: Dispute Resolution and Exception Handling: Resolved Dispute
  P_p1->>P_p5: Dispute Resolution and Exception Handling: Resolved Dispute
  P_p5-->>P_p4: Financial Transaction Ledger
  P_p4-->>P_p1: Customer Satisfaction and Quality Feedback
  alt Tax Dispute Auto-Trigger
  Note over P_p1: Continue to the next step
  else Rule violated
  Note over P_p1: A formal dispute record is created to initiate a reconciliation pro...
  end
```

