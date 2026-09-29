User:
You are a strict brand strategist and business consultant. Read the business idea inside the JSON payload below. Output ONLY the primary industry business domains and niches it belongs to. Do not generate website URLs, do not create diagrams, and do not write any introductory text.

Format the output exactly like this:
- **Primary Domain:** [Main Industry Sector]
- **Sub-Domains:** [Niche 1], [Niche 2], [Niche 3]
[SOURCE ARCHITECTURE PAYLOAD]:
{
  "CORE_DOMAIN": "online groceries store",
  "BusinessObjectsDeepArchitecture": [
    {
      "BusinessObjectName": "Customer",
      "PrimaryRelations": [
        "Owns ShippingAddress (1:M)",
        "Places Order (1:M)"
      ],
      "KeyStateTransitions": [
        "Registered -> Active -> Suspended -> Deleted"
      ]
    },
    {
      "BusinessObjectName": "Product",
      "PrimaryRelations": [
        "Belongs to Inventory (1:M)",
        "Supplied by Supplier (1:M)",
        "Stored in Warehouse (1:M)"
      ],
      "KeyStateTransitions": [
        "Created -> Available -> OutOfStock -> Discontinued"
      ]
    },
    {
      "BusinessObjectName": "Order",
      "PrimaryRelations": [
        "Belongs to Customer (1:M)",
        "Contains OrderLine (1:M)",
        "Has Payment (1:M)",
        "Has ShippingAddress (1:M)",
        "Linked to Delivery (1:M)"
      ],
      "KeyStateTransitions": [
        "Created -> Paid -> Processing -> Shipped -> Delivered -> Cancelled"
      ]
    },
    {
      "BusinessObjectName": "OrderLine",
      "PrimaryRelations": [
        "Belongs to Order (M:1)",
        "References Product (M:1)"
      ],
      "KeyStateTransitions": [
        "Created -> Confirmed -> Shipped -> Delivered"
      ]
    },
    {
      "BusinessObjectName": "Inventory",
      "PrimaryRelations": [
        "Contains Product (1:M)",
        "Linked to Warehouse (1:M)"
      ],
      "KeyStateTransitions": [
        "Initialized -> Stocked -> Depleted -> Replenished"
      ]
    },
    {
      "BusinessObjectName": "Supplier",
      "PrimaryRelations": [
        "Supplies Product (1:M)",
        "Linked to Warehouse (1:M)"
      ],
      "KeyStateTransitions": [
        "Registered -> Active -> Suspended -> Deleted"
      ]
    },
    {
      "BusinessObjectName": "Warehouse",
      "PrimaryRelations": [
        "Stores Inventory (1:M)",
        "Linked to Supplier (1:M)"
      ],
      "KeyStateTransitions": [
        "Initialized -> Operational -> Maintenance -> Decommissioned"
      ]
    },
    {
      "BusinessObjectName": "Payment",
      "PrimaryRelations": [
        "Belongs to Order (M:1)",
        "Processed by PaymentGateway (1:1)"
      ],
      "KeyStateTransitions": [
        "Initiated -> Approved -> Failed -> Refunded"
      ]
    },
    {
      "BusinessObjectName": "ShippingAddress",
      "PrimaryRelations": [
        "Belongs to Customer (1:M)",
        "Linked to Order (M:1)"
      ],
      "KeyStateTransitions": [
        "Created -> Valid -> Modified -> Deleted"
      ]
    },
    {
      "BusinessObjectName": "Delivery",
      "PrimaryRelations": [
        "Linked to Order (M:1)",
        "Linked to Warehouse (1:M)"
      ],
      "KeyStateTransitions": [
        "Scheduled -> InTransit -> Delivered -> Cancelled"
      ]
    }
  ]
}

Assistant:
- **Primary Domain:** Retail
- **Sub-Domains:** Online Groceries, E-commerce, Inventory Management, Logistics, Payment Processing

