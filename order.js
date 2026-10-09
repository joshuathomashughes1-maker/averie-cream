import { minimumPickupDate, products } from "./lib/order-validation.ts";

const callbackParameters = new URLSearchParams(window.location.hash.slice(1));
if (["invite_token", "recovery_token", "confirmation_token", "access_token", "email_change_token"].some((key) => callbackParameters.has(key))) {
  window.location.replace(`/admin.html${window.location.hash}`);
}

const form = document.getElementById("orderForm");
const pickupDate = form.elements.pickupDate;
const rushType = form.elements.rushType;
const details = form.elements.orderDetails;
const message = document.getElementById("orderMessage");
const submit = form.querySelector('button[type="submit"]');
let pendingSubmission = null;

function updatePickup() {
  pickupDate.min = minimumPickupDate(rushType.value);
  if (!pickupDate.value || pickupDate.value < pickupDate.min) pickupDate.value = pickupDate.min;
}

function updateProducts() {
  form.elements[products[0]].setCustomValidity("");
  details.required = Number(form.elements["custom-full-cheesecake"].value) > 0;
}

updatePickup();
submit.disabled = false;
rushType.addEventListener("change", updatePickup);
products.forEach((product) => form.elements[product].addEventListener("input", updateProducts));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const items = products.map((product) => ({ product, quantity: Number(data.get(product)) })).filter((item) => item.quantity > 0);
  if (!items.length) {
    form.elements[products[0]].setCustomValidity("Choose at least one cheesecake.");
    form.reportValidity();
    return;
  }
  const payload = {
    customerName: data.get("customerName"),
    customerEmail: data.get("customerEmail"),
    customerPhone: data.get("customerPhone"),
    pickupDate: data.get("pickupDate"),
    rushType: data.get("rushType"),
    orderDetails: data.get("orderDetails"),
    customerNotes: data.get("customerNotes"),
    website: data.get("website"),
    items,
  };
  const fingerprint = JSON.stringify(payload);
  if (!pendingSubmission || pendingSubmission.fingerprint !== fingerprint) {
    pendingSubmission = { fingerprint, id: crypto.randomUUID() };
  }
  submit.disabled = true;
  submit.textContent = "Sending your order…";
  message.classList.remove("error");
  message.textContent = "Saving your order securely…";
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, id: pendingSubmission.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to send your order. Please try again.");
    message.textContent = `Thank you! Your order request ${result.reference} is saved. Keep this reference. We’ll contact you to confirm availability and pricing. Pay in cash at pickup.`;
    form.reset();
    pendingSubmission = null;
    updatePickup();
    updateProducts();
    message.focus();
  } catch (error) {
    message.classList.add("error");
    message.textContent = error instanceof Error ? error.message : "Check your connection and try again. Your details are still here.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Send Order";
  }
});
