import { getUser, refreshSession, verifyRequestOrigin, AuthError } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { orders, orderItems } from "../../db/schema.js";
import { objectValue, statuses, uuidPattern, validateOrder, validateUpdate, ValidationError } from "../../lib/order-validation.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ValidationError("Send JSON data.");
  const text = await request.text();
  if (text.length > 16000) throw new ValidationError("Your order details are too long.");
  try {
    return objectValue(JSON.parse(text));
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Invalid JSON data.");
  }
}

export default async (request: Request, context: Context) => {
  try {
    const orderId = context.params.id;
    if (request.method === "POST" && !orderId) {
      verifyRequestOrigin(request);
      const { items, ...order } = validateOrder(await readBody(request));
      const db = getDb();
      await db.transaction(async (transaction) => {
        const inserted = await transaction.insert(orders).values(order).onConflictDoNothing({ target: orders.id }).returning({ id: orders.id });
        if (inserted.length) {
          await transaction.insert(orderItems).values(items.map((item) => ({ ...item, orderId: order.id })));
        }
      });
      return json({ id: order.id, reference: `AC-${order.id.slice(0, 13).toUpperCase()}` }, 201);
    }

    if (request.method !== "GET" && request.method !== "PATCH") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, PATCH", "Cache-Control": "no-store" } });
    }
    await refreshSession();
    const user = await getUser();
    if (!user) return json({ error: "Please sign in to manage orders." }, 401);
    if (!user.roles?.includes("admin")) return json({ error: "An admin role is required. Ask the site owner to grant it in Netlify Identity." }, 403);

    if (request.method === "GET" && !orderId) {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "all";
      if (status !== "all" && !statuses.includes(status as typeof statuses[number])) throw new ValidationError("Invalid status filter.");
      const search = (url.searchParams.get("search") || "").trim();
      if (search.length > 120) throw new ValidationError("Search must be shorter than 120 characters.");
      const pageText = url.searchParams.get("page") || "1";
      if (!/^\d+$/.test(pageText)) throw new ValidationError("Invalid page.");
      const page = Number(pageText);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ValidationError("Invalid page.");
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      const where = and(
        status === "all" ? undefined : eq(orders.status, status as typeof statuses[number]),
        search ? or(ilike(orders.customerName, pattern), ilike(orders.customerEmail, pattern), ilike(orders.customerPhone, pattern)) : undefined,
      );
      const db = getDb();
      const [rows, totals, statusCounts] = await Promise.all([
        db.select().from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(30).offset((page - 1) * 30),
        db.select({ total: count() }).from(orders).where(where),
        db.select({ status: orders.status, total: count() }).from(orders).groupBy(orders.status),
      ]);
      const items = rows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((row) => row.id))) : [];
      return json({
        orders: rows.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id) })),
        total: totals[0].total,
        page,
        pageSize: 30,
        statusCounts,
      });
    }

    if (request.method === "PATCH" && orderId) {
      verifyRequestOrigin(request);
      if (!uuidPattern.test(orderId)) throw new ValidationError("Invalid order reference.");
      const update = validateUpdate(await readBody(request));
      const changed = await getDb().update(orders).set(update).where(eq(orders.id, orderId)).returning({ id: orders.id });
      if (!changed.length) return json({ error: "Order not found." }, 404);
      return json({ saved: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message }, 400);
    if (error instanceof AuthError) return json({ error: "Your session or request could not be verified. Sign in again." }, error.status === 403 ? 403 : 401);
    console.error("Order request failed.");
    return json({ error: "Unable to save or load orders right now. Please try again." }, 503);
  }
};

export const config: Config = {
  path: ["/api/orders", "/api/orders/:id"],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["domain", "ip"] },
};
