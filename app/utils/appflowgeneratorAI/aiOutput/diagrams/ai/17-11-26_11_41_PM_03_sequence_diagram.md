# Sequence Diagrams

Interactions between actors and system participants over time.

Dashed outlines and elements marked * were added by AI. Solid elements come from the repositories.

Generated 2026-11-17T18:18:20.523Z by 8.0.13.DiagramsAI.js using unsloth/Qwen3.5-9B-GGUF. Sources: knowledge base (10 actors, 14 business objects, 11 activities, 11 lifecycle stages, 20 information requirements), requirements schema (62 functional, 28 business requirements), business_rule_discovery (142 rules after merging 168 raw rules, ingestion run 3).

| Unit | Covers | Source | New elements |
|---|---|---|---|
| SEQ-1 | Foundation Establishment to Last-Mile Delivery | AI complete | 21 |
| SEQ-2 | Handover & Confirmation to Business Decision | AI complete | 48 |
| SEQ-3 | Exception paths: Dispute Ticket and Financial Transaction... | AI complete | 21 |

## SEQ-1: Foundation Establishment to Last-Mile Delivery

Focus: Interactions, handovers, confirmations, checks and alternatives for Foundation Establishment to Last-Mile Delivery.

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
  P_p5-->>P_p1: Commercial Partnership Terms and Service Level ...
  P_p5->>P_p1: Commercial Partnership Terms and Service Level Agreement *
  alt Regulatory Zone Activation Gate
  alt Regulatory Zone Activation Gate *
  alt condition *
  Note over P_p1: Continue to the next step
  else Rule violated *
  else Rule violated
  Note over P_p1: The system blocks the activation of the zone and prevents any order processin... *
  Note over P_p1: The system blocks the activation of the zone and prevents any order...
  end
  end
  Note over P_p1: Supply Chain Integration *
  Note over P_p1: Supply Chain Integration
  P_p1->>P_p5: Inventory Synchronization and Validation: Verified Inventory Status *
  P_p1->>P_p5: Inventory Synchronization and Validation: Verified Inventory Status
  P_p1->>P_p6: Inventory Synchronization and Validation: Verified Inventory Status *
  P_p1->>P_p6: Inventory Synchronization and Validation: Verified Inventory Status
  P_p5->>P_p1: Inventory Synchronization Health Metrics *
  P_p5-->>P_p4: Real-Time Stock Availability and Status
  alt Sync Discrepancy Flagging *
  P_p5-->>P_p1: Inventory Synchronization Health Metrics
  alt condition *
  alt Sync Discrepancy Flagging
  else Rule violated *
  Note over P_p1: Continue to the next step
  Note over P_p1: The system halts order processing for affected stores and alerts the Fulfillm... *
  else Rule violated
  end
  Note over P_p1: The system halts order processing for affected stores and alerts th...
  Note over P_p4: Order Initiation *
  end
  P_p4->>P_p1: Order Composition and Delivery Instructions *
  Note over P_p4: Order Initiation
  alt Discontinued Item Blocking *
  P_p4->>P_p4: Order Initiation and Demand Capture
  alt condition *
  P_p5-->>P_p4: Real-Time Stock Availability and Status
  else Rule violated *
  P_p5-->>P_p4: Aggregated Product Catalog and Pricing
  Note over P_p4: The system blocks the item selection and displays a 'Product Unavailable' mes... *
  alt Discontinued Item Blocking
  end
  Note over P_p4: Continue to the next step
  Note over P_p6: Order Validation and Allocation *
  else Rule violated
  P_p6->>P_p1: Order Validation and Resource Allocation: Confirmed Order Assignment *
  Note over P_p4: The system blocks the item selection and displays a 'Product Unavai...
  P_p7->>P_p5: Order Preparation and Handover Confirmation *
  end
  P_p5->>P_p8: Order Handover and Routing Instructions *
  Note over P_p6: Order Validation and Allocation
  P_p8->>P_p4: Order Delivery and Completion Confirmation *
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
  end
  end
  end
```

## SEQ-2: Handover & Confirmation to Business Decision

Focus: Interactions, handovers, confirmations, checks and alternatives for Handover & Confirmation to Business Decision.

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
  actor P_q8 as Regulatory Authority
  actor P_q9 as Fulfillment Supervisor
  Note over P_p1: Handover and Confirmation
  Note over P_p1: Handover and Confirmation to Business Decision: Initiate handover process *
  P_p1->>P_p2: Delivery Handover and Proof Generation: Signed/Photo Delivery Proof
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p3: Customer Identity and Contact Information
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p4: Proof of Delivery (POD) Evidence
  alt Delivery Proof Rejection for Cancelled Assignments *
  alt Delivery Proof Rejection for Cancelled Assignments
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p1: Continue to the next step
  alt Delivery Proof Rejection for Cancelled Assignments *
  else Rule violated
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p1: The system rejects the submission and logs an error, preventing fal...
  alt Delivery Proof Rejection for Cancelled Assignments *
  end
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p5: Financial Settlement
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p5->>P_p4: Payment Processing and Financial Settlement: Processed Payment
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p5->>P_p6: Payment Processing and Financial Settlement: Processed Payment
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p3: Customer Identity and Contact Information
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p4: Proof of Delivery (POD) Evidence
  alt Delivery Proof Rejection for Cancelled Assignments *
  alt Delivery Verification Mandate
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p5: Continue to the next step
  alt Delivery Proof Rejection for Cancelled Assignments *
  else Rule violated
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p5: The settlement status remains 'Pending' and funds are withheld unti...
  alt Delivery Proof Rejection for Cancelled Assignments *
  end
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p2: Post-Transaction Review
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2->>P_p4: Post-Transaction Review and Feedback Collection: Customer Ratings a...
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p4: Customer Satisfaction and Quality Feedback
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p4: Exception and Dispute Ticket Registry
  alt Delivery Proof Rejection for Cancelled Assignments *
  alt Feedback Assignment Binding
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p2: Continue to the next step
  alt Delivery Proof Rejection for Cancelled Assignments *
  else Rule violated
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p2: The feedback is rejected or logged as 'Unattributed', preventing ac...
  alt Delivery Proof Rejection for Cancelled Assignments *
  end
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p4->>P_p2: Dispute Resolution and Exception Handling: Resolved Dispute
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p4->>P_p6: Dispute Resolution and Exception Handling: Resolved Dispute
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p6-->>P_p2: Financial Transaction Ledger
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p2-->>P_p4: Customer Satisfaction and Quality Feedback
  alt Delivery Proof Rejection for Cancelled Assignments *
  alt Refund Precondition
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p4: Continue to the next step
  alt Delivery Proof Rejection for Cancelled Assignments *
  else Rule violated
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p4: Revenue leakage or incorrect financial reporting occurs
  alt Delivery Proof Rejection for Cancelled Assignments *
  end
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p7: Business Decision
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p7->>P_p7: Product Catalog Curation and Strategy
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p6-->>P_p4: Commercial Partnership Terms and Service Level ...
  alt Delivery Proof Rejection for Cancelled Assignments *
  P_p6-->>P_p2: Real-Time Stock Availability and Status
  alt Delivery Proof Rejection for Cancelled Assignments *
  alt Perishable Expiry Enforcement
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p7: Continue to the next step
  alt Delivery Proof Rejection for Cancelled Assignments *
  else Rule violated
  alt Delivery Proof Rejection for Cancelled Assignments *
  Note over P_p7: The system rejects the Order Request and logs a compliance error fo...
  alt Delivery Proof Rejection for Cancelled Assignments *
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
  end
```

## SEQ-3: Exception paths: Dispute Ticket and Financial Transaction Record

Focus: Interactions when something goes wrong in Exception paths: Dispute Ticket and Financial Transaction Record.

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
  actor P_q8 as Payment Provider
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
  alt Customer initiates a Dispute Ticket for Financial Transac... *
  Note over P_p7: Continue to the next step
  Note over P_p4: Customer reports unauthorized or incorrect charge *
  else Rule violated
  Note over P_p1: Platform Operator initiates Financial Transaction Record review *
  Note over P_p7: The Order Request remains in a pending state, blocking closure and ...
  alt Payment Provider validates transaction status *
  end
  Note over P_q8: Payment Provider returns transaction status and details *
  Note over P_p1: Post-Transaction Review
  Note over P_p1: Platform Operator updates Dispute Ticket with Financial Transaction Record *
  P_p1->>P_p4: Dispute Resolution and Exception Handling: Resolved Dispute
  alt Dispute Ticket resolved via refund or adjustment *
  P_p1->>P_p5: Dispute Resolution and Exception Handling: Resolved Dispute
  Note over P_p1: Platform Operator notifies Customer of resolution *
  P_p5-->>P_p4: Financial Transaction Ledger
  Note over P_p1: Platform Operator updates Store Partner record if applicable *
  P_p4-->>P_p1: Customer Satisfaction and Quality Feedback
  alt Dispute Ticket requires Merchant intervention *
  alt Tax Dispute Auto-Trigger
  Note over P_p1: Platform Operator notifies Merchandiser for investigation *
  Note over P_p1: Continue to the next step
  Note over P_p3: Merchandiser investigates inventory or pricing discrepancy *
  else Rule violated
  Note over P_p3: Merchandiser updates Dispute Ticket with findings *
  Note over P_p1: A formal dispute record is created to initiate a reconciliation pro...
  Note over P_p1: Platform Operator notifies Customer of findings *
  end
  alt Dispute Ticket escalates to Regulatory Authority *
  Note over P_p1: Platform Operator submits Dispute Ticket to Regulatory Authority *
  Note over P_p2: Regulatory Authority reviews compliance and enforcement *
  Note over P_p2: Regulatory Authority issues compliance directive *
  Note over P_p1: Platform Operator executes compliance directive *
  Note over P_p1: Platform Operator notifies Customer of compliance action *
  end
  end
  end
  end
  end
```

