export const products = ["signature-cheesecake", "cheesecake-cup", "custom-full-cheesecake"] as const;
export const statuses = ["new", "confirmed", "baking", "ready", "completed", "cancelled"] as const;
export const rushTypes = ["standard", "next-day", "same-day"] as const;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {}

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Please send a valid order.");
  }
  return value as Record<string, unknown>;
}

export function textValue(value: unknown, label: string, maximum: number, required = true): string {
  if (typeof value !== "string") throw new ValidationError(`${label} is invalid.`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > maximum) {
    throw new ValidationError(`${label} ${required ? "is required and " : ""}must be no longer than ${maximum} characters.`);
  }
  return cleaned;
}

export function minimumPickupDate(rush: typeof rushTypes[number], now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + (rush === "standard" ? 2 : rush === "next-day" ? 1 : 0));
  return date.toISOString().slice(0, 10);
}

export function validateOrder(value: unknown, now = new Date()) {
  const body = objectValue(value);
  if (body.website) throw new ValidationError("Unable to submit this order.");
  if (typeof body.id !== "string" || !uuidPattern.test(body.id)) throw new ValidationError("Invalid order reference. Refresh the page and try again.");
  const customerName = textValue(body.customerName, "Name", 120);
  const customerEmail = textValue(body.customerEmail, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new ValidationError("Enter a valid email address.");
  const customerPhone = textValue(body.customerPhone, "Phone number", 30);
  if (!/^[+\d\s().-]+$/.test(customerPhone) || customerPhone.replace(/\D/g, "").length < 7) {
    throw new ValidationError("Enter a valid phone number with at least 7 digits.");
  }
  const rush = body.rushType;
  if (!rushTypes.includes(rush as typeof rushTypes[number])) throw new ValidationError("Choose a valid pickup speed.");
  const selectedRush = rush as typeof rushTypes[number];
  const pickupDate = textValue(body.pickupDate, "Pickup date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || Number.isNaN(Date.parse(pickupDate)) || new Date(pickupDate).toISOString().slice(0, 10) !== pickupDate) {
    throw new ValidationError("Choose a valid pickup date.");
  }
  if (pickupDate < minimumPickupDate(selectedRush, now)) throw new ValidationError("The pickup date is too soon for your selected pickup speed.");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 3) throw new ValidationError("Choose at least one cheesecake.");
  const selectedProducts = new Set<string>();
  const items = body.items.map((value: unknown) => {
    const item = objectValue(value);
    if (!products.includes(item.product as typeof products[number]) || selectedProducts.has(String(item.product))) throw new ValidationError("Choose valid, unique cheesecake products.");
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 100) throw new ValidationError("Each quantity must be a whole number from 1 to 100.");
    selectedProducts.add(String(item.product));
    return { product: item.product as typeof products[number], quantity: Number(item.quantity) };
  });
  const orderDetails = textValue(body.orderDetails ?? "", "Order details", 2000, false);
  if (selectedProducts.has("custom-full-cheesecake") && !orderDetails) throw new ValidationError("Describe the flavor or design for your custom full cheesecake.");
  return {
    id: body.id,
    customerName,
    customerEmail,
    customerPhone,
    pickupDate,
    rushType: selectedRush,
    rushFeeCents: selectedRush === "next-day" ? 800 : selectedRush === "same-day" ? 2000 : 0,
    orderDetails,
    customerNotes: textValue(body.customerNotes ?? "", "Notes", 2000, false),
    items,
  };
}

export function validateUpdate(value: unknown) {
  const body = objectValue(value);
  if (!statuses.includes(body.status as typeof statuses[number])) throw new ValidationError("Choose a valid order status.");
  if (typeof body.cashPaid !== "boolean") throw new ValidationError("Cash payment must be marked paid or unpaid.");
  return {
    status: body.status as typeof statuses[number],
    cashPaid: body.cashPaid,
    ownerNotes: textValue(body.ownerNotes ?? "", "Private notes", 2000, false),
    updatedAt: new Date(),
  };
}
