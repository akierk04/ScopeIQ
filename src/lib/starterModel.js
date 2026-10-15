// Generic starter data model. Deliberately vendor-neutral: common business
// entities with common fields, intended to be edited or replaced by each user.
// It is only a starting point and says nothing about any real product's schema.
//
// field tuple: [name, dataType, required, isKey, description, synonyms[]]

export const STARTER_MODEL = {
  name: "Generic starter model",
  description: "Common business entities. Edit, extend or replace it with your own product's data model.",
  entities: [
    {
      name: "Customer",
      description: "A company or person you do business with.",
      fields: [
        ["customer_id", "string", true, true, "Unique identifier for the customer", ["account id", "customer number", "account number", "client id", "cust no"]],
        ["customer_name", "string", true, false, "Legal or trading name", ["account name", "company name", "client name", "name"]],
        ["customer_type", "string", false, false, "Segment or classification", ["segment", "account type", "channel", "tier"]],
        ["status", "string", false, false, "Active, inactive, on hold", ["account status", "credit status"]],
        ["region", "string", false, false, "Sales or geographic region", ["territory", "sales region"]],
        ["country", "string", false, false, "Country", ["country code"]],
        ["created_date", "date", false, false, "Date the customer was created", ["customer since", "open date"]],
      ],
    },
    {
      name: "Contact",
      description: "A person at a customer.",
      fields: [
        ["contact_id", "string", true, true, "Unique identifier for the contact", ["person id"]],
        ["customer_id", "string", true, false, "Customer this contact belongs to", ["account id", "company id"]],
        ["first_name", "string", false, false, "Given name", ["given name", "forename"]],
        ["last_name", "string", false, false, "Family name", ["surname", "family name"]],
        ["email", "string", false, false, "Email address", ["email address", "e-mail"]],
        ["phone", "string", false, false, "Phone number", ["phone number", "telephone", "mobile"]],
        ["job_title", "string", false, false, "Role or title", ["title", "role", "position"]],
      ],
    },
    {
      name: "Location",
      description: "A ship-to, bill-to or site address.",
      fields: [
        ["location_id", "string", true, true, "Unique identifier for the location", ["site id", "ship to id", "address id", "warehouse code", "plant"]],
        ["customer_id", "string", false, false, "Owning customer, if any", ["account id"]],
        ["location_name", "string", false, false, "Display name", ["site name", "warehouse name"]],
        ["address_line1", "string", false, false, "Street address", ["street", "address", "address 1"]],
        ["city", "string", false, false, "City", ["town"]],
        ["state_region", "string", false, false, "State or province", ["state", "province"]],
        ["postal_code", "string", false, false, "Postal or ZIP code", ["zip", "zip code", "post code"]],
        ["country", "string", false, false, "Country", ["country code"]],
      ],
    },
    {
      name: "Product",
      description: "An item, SKU or service that is sold or tracked.",
      fields: [
        ["product_id", "string", true, true, "Unique identifier for the product", ["sku", "item id", "item number", "part number", "product code", "product sku", "material number"]],
        ["product_name", "string", true, false, "Display name", ["item name", "item description", "material description"]],
        ["description", "string", false, false, "Longer description", ["product description", "long description"]],
        ["category", "string", false, false, "Product category or family", ["product category", "product family", "product group"]],
        ["unit_of_measure", "string", false, false, "Base unit of measure", ["uom", "unit", "base unit"]],
        ["status", "string", false, false, "Active, discontinued, etc.", ["product status", "lifecycle"]],
        ["list_price", "decimal", false, false, "Standard list price", ["price", "standard price", "msrp"]],
      ],
    },
    {
      name: "Order",
      description: "A customer order header.",
      fields: [
        ["order_id", "string", true, true, "Unique identifier for the order", ["order number", "sales order", "so number", "po number"]],
        ["customer_id", "string", true, false, "Customer who placed the order", ["account id", "sold to", "sold to id"]],
        ["order_date", "date", true, false, "Date the order was placed", ["date ordered", "created date", "transaction date"]],
        ["status", "string", false, false, "Order status", ["order status"]],
        ["currency", "string", false, false, "Currency code", ["currency code"]],
        ["total_amount", "decimal", false, false, "Order total", ["order total", "net amount", "total value"]],
      ],
    },
    {
      name: "Order Line",
      description: "One product line on an order.",
      fields: [
        ["order_line_id", "string", true, true, "Unique identifier for the line", ["line id", "line number", "item number"]],
        ["order_id", "string", true, false, "Parent order", ["order number", "sales order"]],
        ["product_id", "string", true, false, "Product on the line", ["sku", "item id", "part number", "product sku", "material number"]],
        ["quantity", "decimal", true, false, "Units ordered", ["qty", "units", "quantity ordered", "order quantity"]],
        ["unit_price", "decimal", true, false, "Price per unit", ["price", "net price", "selling price"]],
        ["line_amount", "decimal", false, false, "Extended line amount", ["extended price", "line total", "net value"]],
      ],
    },
    {
      name: "Invoice",
      description: "A billing document.",
      fields: [
        ["invoice_id", "string", true, true, "Unique identifier for the invoice", ["invoice number", "bill number", "billing document"]],
        ["customer_id", "string", true, false, "Billed customer", ["account id", "bill to", "bill to id"]],
        ["order_id", "string", false, false, "Related order", ["order number", "sales order"]],
        ["invoice_date", "date", true, false, "Date of the invoice", ["billing date", "bill date"]],
        ["due_date", "date", false, false, "Payment due date", ["payment due", "net due date"]],
        ["amount", "decimal", true, false, "Invoice amount", ["invoice amount", "total", "billed amount"]],
        ["currency", "string", false, false, "Currency code", ["currency code"]],
        ["status", "string", false, false, "Open, paid, void", ["invoice status", "payment status"]],
      ],
    },
  ],
};
