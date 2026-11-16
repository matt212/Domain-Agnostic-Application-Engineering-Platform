# Use Case Diagram

**System:** Perishable Goods Management Platform

**Actors:** 2

**Use cases:** 4

**Actor relationships:** 4

**Include / extend relationships:** 0

## Diagram

```mermaid
flowchart LR
  a_ACTOR_001["Store Partner<br/>«actor»"]:::actor
  a_ACTOR_002["Platform Operator<br/>«actor»"]:::actor
  subgraph SYS["System boundary: Perishable Goods Management Platform"]
    u_UC_001(["Manage Perishable Inventory"]):::uc
    u_UC_002(["Process Orders"]):::uc
    u_UC_003(["Orchestrate System Operations"]):::uc
    u_UC_004(["Manage Promotions"]):::uc
  end
  a_ACTOR_001 --- u_UC_001
  a_ACTOR_001 --- u_UC_002
  a_ACTOR_002 --- u_UC_003
  a_ACTOR_002 --- u_UC_004
  classDef actor fill:#fff7e6,stroke:#d48806,color:#000
  classDef actorInf fill:#fff7e6,stroke:#d48806,stroke-dasharray:5 5,color:#000
  classDef uc fill:#e6f4ff,stroke:#1677ff,color:#000
  classDef ucInf fill:#e6f4ff,stroke:#1677ff,stroke-dasharray:5 5,color:#000
```

## Diagram Specification

```json
{
  "system_name": "Perishable Goods Management Platform",
  "actors": [
    {
      "id": "ACTOR_001",
      "name": "Store Partner",
      "kind": "primary",
      "inferred": false
    },
    {
      "id": "ACTOR_002",
      "name": "Platform Operator",
      "kind": "primary",
      "inferred": false
    }
  ],
  "use_cases": [
    {
      "id": "UC_001",
      "name": "Manage Perishable Inventory",
      "inferred": false
    },
    {
      "id": "UC_002",
      "name": "Process Orders",
      "inferred": false
    },
    {
      "id": "UC_003",
      "name": "Orchestrate System Operations",
      "inferred": false
    },
    {
      "id": "UC_004",
      "name": "Manage Promotions",
      "inferred": false
    }
  ],
  "links": [
    {
      "actor": "ACTOR_001",
      "use_case": "UC_001",
      "kind": "primary"
    },
    {
      "actor": "ACTOR_001",
      "use_case": "UC_002",
      "kind": "primary"
    },
    {
      "actor": "ACTOR_002",
      "use_case": "UC_003",
      "kind": "primary"
    },
    {
      "actor": "ACTOR_002",
      "use_case": "UC_004",
      "kind": "primary"
    }
  ],
  "includes": []
}
```
