# Averie & Cream

The bakery website accepts order requests for Signature Cheesecake, Cheesecake Cup, and Custom Full Cheesecake. Requests are stored in Netlify Database (managed PostgreSQL), with customer contact details, product quantities, requested pickup dates, rush fees, and customization notes. Prices are confirmed by the baker; there is no online payment processing, and customers pay in cash at pickup.

## First-time owner setup

After the deployment finishes:

1. Open the site's **Project configuration > Identity** in Netlify and set registration to **Invite only**. Customers do not need an account to order.
2. Invite your own email address from the Identity users screen.
3. Open your invited user in Netlify and assign the **admin** role. Only this server-managed role grants access to customer orders; being logged in alone does not.
4. Follow the invitation email, set your password, and open `/admin.html`. Invitation and password-recovery links that land on the storefront automatically continue to the dashboard.

The dashboard shows incoming orders, customer contact information, and pickup requests. Search by customer name, email, or phone, filter by status, and move an order through New, Confirmed, Baking, Ready for pickup, Completed, or Cancelled. You can also record cash payment and add private baker's notes. Status changes do not send automatic customer emails; use the contact details to confirm availability, prices, and pickup arrangements directly.

If the dashboard reports that an admin role is missing, assign the role in Netlify Identity, then sign out and back in. Do not put credentials in the repository or share owner accounts with customers.

## Data and deployment

The source of truth for the database is `db/schema.ts`. Drizzle migrations live in `netlify/database/migrations/` and are applied by Netlify during deployment. Netlify provisions the database on first connection. No connection strings or manually configured database passwords are needed in the code.

Order submission saves the order and its product rows in a single transaction. Retrying the same submission does not create another order. Customer data and private notes are only available from authenticated, admin-authorized API requests; the public endpoint never lists orders. Request bodies are validated on the server, rush fees are calculated on the server, and pickup dates are checked according to the selected speed. Date cutoffs use UTC consistently on both sides. Rush pickup is a request, not an automatic guarantee.

Netlify Identity is enabled by the feature marker in `.netlify/features/netlify-identity`. The site uses `@netlify/identity`, Netlify Functions, and `@netlify/database` with Drizzle ORM. Vite packages the two static pages and the browser Identity client; only `dist` is published, not database source files or dependencies.

For local development, install dependencies with `npm install`, then start Netlify Dev on port 8889. Run `npm run typecheck` for TypeScript validation. After changing the schema, generate a new migration with `npx drizzle-kit generate --name describe_your_change`. Do not edit applied migration files.
