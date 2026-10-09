import { acceptInvite, getUser, handleAuthCallback, login, logout, onAuthChange, requestPasswordRecovery, updateUser } from "@netlify/identity";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const passwordForm = document.getElementById("passwordForm");
const loginMessage = document.getElementById("loginMessage");
const dashboardMessage = document.getElementById("dashboardMessage");
const filterForm = document.getElementById("filterForm");
const orderList = document.getElementById("orderList");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const labels = { new: "New", confirmed: "Confirmed", baking: "Baking", ready: "Ready for pickup", completed: "Completed", cancelled: "Cancelled" };
const productLabels = { "signature-cheesecake": "Signature Cheesecake", "cheesecake-cup": "Cheesecake Cup", "custom-full-cheesecake": "Custom Full Cheesecake" };
let page = 1;
let loadSequence = 0;
let inviteToken = null;

function showLogin(message = "") {
  loadSequence += 1;
  dashboard.hidden = true;
  loginPanel.hidden = false;
  orderList.replaceChildren();
  loginMessage.textContent = message;
}

function loginError(message) {
  loginMessage.classList.add("error");
  loginMessage.textContent = message;
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      await logout().catch(() => {});
      showLogin();
      loginError(body.error || "Please sign in again.");
    }
    throw new Error(body.error || "Unable to connect. Please try again.");
  }
  return body;
}

function displayDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function renderOrder(order) {
  const card = document.getElementById("orderTemplate").content.firstElementChild.cloneNode(true);
  card.querySelector(".order-reference").textContent = `AC-${order.id.slice(0, 13).toUpperCase()}`;
  card.querySelector(".customer-name").textContent = order.customerName;
  const badge = card.querySelector(".status-badge");
  badge.textContent = labels[order.status];
  badge.dataset.status = order.status;
  order.items.forEach((item) => {
    const line = document.createElement("li");
    line.textContent = `${item.quantity} × ${productLabels[item.product]}`;
    card.querySelector(".item-list").append(line);
  });
  card.querySelector(".pickup-info").textContent = `Pickup requested: ${displayDate(order.pickupDate)}`;
  const rushLabel = order.rushType === "standard" ? "Standard pickup" : order.rushType === "next-day" ? "Next-day rush" : "Same-day rush";
  card.querySelector(".rush-info").textContent = `${rushLabel}${order.rushFeeCents ? ` · $${order.rushFeeCents / 100} rush fee` : ""} · Cash at pickup`;
  card.querySelector(".request-info").textContent = order.orderDetails ? `Flavor / design: ${order.orderDetails}` : "";
  card.querySelector(".customer-notes").textContent = order.customerNotes ? `Customer notes: ${order.customerNotes}` : "";
  const email = card.querySelector(".email-link");
  email.textContent = order.customerEmail;
  email.href = `mailto:${encodeURIComponent(order.customerEmail)}`;
  const phone = card.querySelector(".phone-link");
  phone.textContent = order.customerPhone;
  phone.href = `tel:${order.customerPhone.replace(/[^+\d]/g, "")}`;
  card.querySelector(".placed-at").textContent = `Requested ${new Date(order.createdAt).toLocaleString()}`;
  const form = card.querySelector(".order-update");
  form.elements.status.value = order.status;
  form.elements.cashPaid.checked = order.cashPaid;
  form.elements.ownerNotes.value = order.ownerNotes;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const message = form.querySelector(".save-message");
    button.disabled = true;
    message.classList.remove("error");
    message.textContent = "Saving…";
    try {
      await api(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: form.elements.status.value, cashPaid: form.elements.cashPaid.checked, ownerNotes: form.elements.ownerNotes.value }),
      });
      await loadOrders();
      dashboardMessage.classList.remove("error");
      dashboardMessage.textContent = "Order changes saved.";
    } catch (error) {
      message.classList.add("error");
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  return card;
}

async function loadOrders() {
  const sequence = ++loadSequence;
  orderList.setAttribute("aria-busy", "true");
  dashboardMessage.classList.remove("error");
  dashboardMessage.textContent = "Loading your order book…";
  previous.disabled = true;
  next.disabled = true;
  const skeleton = document.createElement("div");
  skeleton.className = "order-skeleton";
  skeleton.setAttribute("aria-hidden", "true");
  orderList.replaceChildren(skeleton);
  try {
    const params = new URLSearchParams({ page: String(page), status: filterForm.elements.status.value, search: filterForm.elements.search.value });
    const result = await api(`/api/orders?${params}`);
    if (sequence !== loadSequence) return;
    const counts = Object.fromEntries(result.statusCounts.map((row) => [row.status, row.total]));
    document.getElementById("newCount").textContent = counts.new || 0;
    document.getElementById("kitchenCount").textContent = (counts.confirmed || 0) + (counts.baking || 0);
    document.getElementById("readyCount").textContent = counts.ready || 0;
    orderList.replaceChildren(...result.orders.map(renderOrder));
    if (!result.orders.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const heading = document.createElement("h2");
      heading.textContent = result.total ? "No more orders on this page" : "A fresh page in your order book";
      const hint = document.createElement("p");
      hint.textContent = filterForm.elements.search.value || filterForm.elements.status.value !== "all" ? "No orders match these filters. Try a different name or status." : "Customer requests appear here after they submit the bakery’s order form.";
      empty.append(heading, hint);
      orderList.append(empty);
    }
    document.getElementById("orderCount").textContent = `${result.total} ${result.total === 1 ? "order" : "orders"} found · Newest requests first`;
    document.getElementById("pageLabel").textContent = `Page ${page} of ${Math.max(1, Math.ceil(result.total / result.pageSize))}`;
    previous.disabled = page <= 1;
    next.disabled = page * result.pageSize >= result.total;
    dashboardMessage.textContent = "";
  } catch (error) {
    if (sequence !== loadSequence) return;
    orderList.replaceChildren();
    dashboardMessage.classList.add("error");
    dashboardMessage.textContent = error.message;
    document.getElementById("orderCount").textContent = "Orders could not be loaded. Use Refresh to try again.";
  } finally {
    if (sequence === loadSequence) orderList.setAttribute("aria-busy", "false");
  }
}

async function openDashboard(user) {
  if (!user?.roles?.includes("admin")) {
    await logout().catch(() => {});
    showLogin();
    loginError("Your account needs the admin role. The site owner can grant it in Netlify Identity, then you can sign in again.");
    return;
  }
  loginPanel.hidden = true;
  dashboard.hidden = false;
  document.getElementById("accountLabel").textContent = `Signed in as ${user.email}`;
  page = 1;
  await loadOrders();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  button.disabled = true;
  loginMessage.classList.remove("error");
  loginMessage.textContent = "Signing in…";
  try {
    const user = await login(loginForm.elements.email.value.trim(), loginForm.elements.password.value);
    loginForm.elements.password.value = "";
    await openDashboard(user);
  } catch {
    loginError("Unable to sign in. Check your email and password, and make sure you’ve accepted your invitation.");
  } finally {
    button.disabled = false;
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordForm.elements.password.value;
  if (password !== passwordForm.elements.confirmPassword.value) {
    loginError("Your passwords don’t match.");
    return;
  }
  const button = passwordForm.querySelector("button");
  button.disabled = true;
  try {
    const user = inviteToken ? await acceptInvite(inviteToken, password) : await updateUser({ password });
    inviteToken = null;
    passwordForm.reset();
    passwordForm.hidden = true;
    loginForm.hidden = false;
    document.getElementById("loginTitle").textContent = "Welcome back";
    document.getElementById("loginHint").textContent = "Use the account invited by the site owner.";
    document.getElementById("forgotPassword").hidden = false;
    await openDashboard(user);
  } catch {
    loginError("Unable to set your password. The link may have expired; request a new invitation or recovery email.");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("forgotPassword").addEventListener("click", async (event) => {
  const email = loginForm.elements.email;
  if (!email.reportValidity()) return;
  event.currentTarget.disabled = true;
  loginMessage.classList.remove("error");
  try {
    await requestPasswordRecovery(email.value.trim());
    loginMessage.textContent = "If an account exists for this email, you’ll receive a password reset link.";
  } catch {
    loginError("Unable to send a recovery email right now. Please try again.");
  } finally {
    document.getElementById("forgotPassword").disabled = false;
  }
});

document.getElementById("logout").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    await logout();
    showLogin("You’re signed out.");
  } catch {
    showLogin("Your order book is closed. Reload this page to check your session.");
  } finally {
    document.getElementById("logout").disabled = false;
  }
});

filterForm.addEventListener("submit", (event) => { event.preventDefault(); page = 1; loadOrders(); });
filterForm.elements.status.addEventListener("change", () => { page = 1; loadOrders(); });
document.getElementById("refresh").addEventListener("click", () => loadOrders());
previous.addEventListener("click", () => { page -= 1; loadOrders(); });
next.addEventListener("click", () => { page += 1; loadOrders(); });
onAuthChange((event) => { if (event === "logout") showLogin("You’re signed out."); });

async function initialize() {
  loginForm.querySelector("button").disabled = true;
  try {
    const callback = await handleAuthCallback();
    if (callback) window.history.replaceState(null, "", window.location.pathname);
    if (callback?.type === "invite" || callback?.type === "recovery") {
      inviteToken = callback.type === "invite" ? callback.token : null;
      loginForm.hidden = true;
      passwordForm.hidden = false;
      document.getElementById("forgotPassword").hidden = true;
      document.getElementById("loginTitle").textContent = callback.type === "invite" ? "Your order book awaits" : "Reset your password";
      document.getElementById("loginHint").textContent = "Choose a password with at least 12 characters.";
      return;
    }
    const user = callback?.user || await getUser();
    if (user) await openDashboard(user);
  } catch {
    window.history.replaceState(null, "", window.location.pathname);
    loginError("Unable to restore your session or open this link. Sign in, or request a new invitation or password reset link.");
  } finally {
    loginForm.querySelector("button").disabled = false;
  }
}

initialize();
