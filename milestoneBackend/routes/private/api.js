const db = require('../../connectors/db');
const { getUser } = require('../../utils/session');
const validateOrderPrereqs = require('../../utils/validateOrderPrereqs');   // ⭐ FIXED — ADDED

function handlePrivateBackendApi(app) {

  // ===========================
  // TEST ROUTE
  // ===========================
  app.get('/test', async (req, res) => {
    try {
      return res.status(200).send("successful connection");
    } catch (err) {
      console.log("error message", err.message);
      return res.status(400).send(err.message);
    }
  });


  // ========================================
  // CART MANAGEMENT — Nada & Maya
  // ========================================

  // ---------------------------
  // ADD TO CART
  // POST /api/v1/cart/new
  // ---------------------------
  app.post('/api/v1/cart/new', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { itemId, quantity } = req.body;
      const qty = Number(quantity);
      const userId = user.userId;

      if (!itemId || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Invalid itemId or quantity' });
      }

      const itemRes = await db.raw(`
        SELECT "itemId","price","name","truckId"
        FROM "FoodTruck"."MenuItems"
        WHERE "itemId" = ?`,
        [itemId]
      );

      if (itemRes.rows.length === 0)
        return res.status(404).json({ error: 'Menu item not found' });

      const unitPrice = itemRes.rows[0].price;

      const cartRes = await db.raw(`
        SELECT * FROM "FoodTruck"."Carts"
        WHERE "userId" = ? AND "itemId" = ?`,
        [userId, itemId]
      );

      if (cartRes.rows.length > 0) {
        const existing = cartRes.rows[0];
        const newQty = existing.quantity + qty;

        const upd = await db.raw(`
          UPDATE "FoodTruck"."Carts"
          SET "quantity" = ?, "price" = ?
          WHERE "cartId" = ?
          RETURNING *`,
          [newQty, unitPrice, existing.cartId]
        );

        return res.json({ message: "Cart updated", cart: upd.rows[0] });
      }

      const insertRes = await db.raw(`
        INSERT INTO "FoodTruck"."Carts"
        ("userId","itemId","quantity","price")
        VALUES (?, ?, ?, ?)
        RETURNING *`,
        [userId, itemId, qty, unitPrice]
      );

      return res.json({ message: 'Added to cart', cart: insertRes.rows[0] });

    } catch (err) {
      console.error("cartAdd error:", err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // ---------------------------
  // VIEW CART
  // GET /api/v1/cart/view
  // ---------------------------
  app.get('/api/v1/cart/view', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const userId = user.userId;

      const result = await db.raw(`
        SELECT c."cartId", c."itemId", c."quantity", c."price" AS "unitPrice",
               m."name", m."description", m."category", m."truckId",
               (c."price" * c."quantity")::numeric(10,2) AS "lineTotal"
        FROM "FoodTruck"."Carts" c
        JOIN "FoodTruck"."MenuItems" m ON c."itemId" = m."itemId"
        WHERE c."userId" = ?
        ORDER BY c."cartId" ASC`,
        [userId]
      );

      const items = result.rows.map(r => ({
        cartId: r.cartId,
        itemId: r.itemId,
        name: r.name,
        description: r.description,
        category: r.category,
        truckId: r.truckId,
        unitPrice: Number(r.unitPrice),
        quantity: r.quantity,
        lineTotal: Number(r.lineTotal)
      }));

      const totals = items.reduce((acc, it) => {
        acc.totalQuantity += it.quantity;
        acc.totalPrice += it.lineTotal;
        return acc;
      }, { totalQuantity: 0, totalPrice: 0 });

      totals.totalPrice = Number(totals.totalPrice.toFixed(2));

      return res.json({ items, totals });

    } catch (err) {
      console.error("cartView error:", err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // ---------------------------
  // UPDATE CART ITEM
  // PUT /api/v1/cart/edit/:cartId
  // ---------------------------
  app.put('/api/v1/cart/edit/:cartId', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const cartId = Number(req.params.cartId);
      const newQty = Number(req.body.quantity);

      if (!Number.isInteger(cartId) || cartId <= 0 || !Number.isInteger(newQty) || newQty <= 0)
        return res.status(400).json({ error: 'Invalid cartId or quantity' });

      const itemRes = await db.raw(
        `SELECT "userId" FROM "FoodTruck"."Carts" WHERE "cartId" = ?`,
        [cartId]
      );

      if (itemRes.rows.length === 0)
        return res.status(404).json({ error: 'Cart item not found' });

      if (itemRes.rows[0].userId !== user.userId)
        return res.status(403).json({ error: 'Forbidden' });

      const updated = await db.raw(`
        UPDATE "FoodTruck"."Carts"
        SET "quantity" = ?
        WHERE "cartId" = ?
        RETURNING *`,
        [newQty, cartId]
      );

      return res.json({ message: 'Cart updated', cart: updated.rows[0] });

    } catch (err) {
      console.error("cartUpdate error:", err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // ---------------------------
  // DELETE CART ITEM
  // DELETE /api/v1/cart/delete/:cartId
  // ---------------------------
  app.delete('/api/v1/cart/delete/:cartId', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const cartId = Number(req.params.cartId);

      const ownerRes = await db.raw(
        `SELECT "userId" FROM "FoodTruck"."Carts" WHERE "cartId" = ?`,
        [cartId]
      );

      if (ownerRes.rows.length === 0)
        return res.status(404).json({ error: 'Cart item not found' });

      if (ownerRes.rows[0].userId !== user.userId)
        return res.status(403).json({ error: 'Forbidden' });

      await db.raw(
        `DELETE FROM "FoodTruck"."Carts" WHERE "cartId" = ?`,
        [cartId]
      );

      return res.json({ message: 'Cart item removed' });

    } catch (err) {
      console.error("cartDelete error:", err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // ========================================
  // TRUCK MANAGEMENT — Mohamed Hassan
  // ========================================

  // GET /api/v1/trucks/view
  app.get('/api/v1/trucks/view', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const result = await db.raw(`
        SELECT "truckId", "truckName", "truckLogo", "truckStatus", "orderStatus"
        FROM "FoodTruck"."Trucks"
        ORDER BY "truckId" ASC
      `);

      return res.json({ trucks: result.rows });

    } catch (err) {
      console.error('viewTrucks error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // GET /api/v1/trucks/myTruck
  app.get('/api/v1/trucks/myTruck', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user || user.role !== 'truckOwner')
        return res.status(403).json({ error: "Forbidden" });

      const ownerId = user.userId;

      const result = await db.raw(`
        SELECT *
        FROM "FoodTruck"."Trucks"
        WHERE "ownerId" = ?`,
        [ownerId]
      );

      if (result.rows.length === 0)
        return res.status(404).json({ error: "No truck found for this owner" });

      return res.json({ truck: result.rows[0] });

    } catch (err) {
      console.error('myTruck error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // PUT /api/v1/trucks/updateOrderStatus
  app.put('/api/v1/trucks/updateOrderStatus', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user || user.role !== 'truckOwner')
        return res.status(403).json({ error: "Forbidden" });

      const { truckId, orderStatus } = req.body;
      if (!truckId || !orderStatus)
        return res.status(400).json({ error: "Missing fields" });

      const truckRes = await db.raw(
        `SELECT * FROM "FoodTruck"."Trucks" WHERE "truckId" = ?`,
        [truckId]
      );

      if (truckRes.rows.length === 0)
        return res.status(404).json({ error: "Truck not found" });

      if (truckRes.rows[0].ownerId !== user.userId)
        return res.status(403).json({ error: "Not your truck" });

      const updateRes = await db.raw(`
        UPDATE "FoodTruck"."Trucks"
        SET "orderStatus" = ?
        WHERE "truckId" = ?
        RETURNING *`,
        [orderStatus, truckId]
      );

      return res.json({
        message: "Truck order status updated",
        truck: updateRes.rows[0]
      });

    } catch (err) {
      console.error('updateOrderStatus error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // ========================================
  // ORDER MANAGEMENT — Ammar
  // ========================================

  // ---------------------------
  // PLACE ORDER
  // POST /api/v1/order/new
  // ---------------------------
  app.post('/api/v1/order/new', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { truckId, scheduledPickupTime } = req.body;
      if (!truckId || !scheduledPickupTime)
        return res.status(400).json({ error: 'Missing fields' });

      const result = await db.transaction(async (trx) => {

        const client = {
          query: async (text, params = []) => {
            const converted = text.replace(/\$\d+/g, '?');
            const r = await trx.raw(converted, params);
            return { rows: r.rows, rowCount: r.rows.length };
          }
        };

        // ⭐ FIXED — Correct function name
        const validated = await validateOrderPrereqs(
          client,
          user.userId,
          truckId,
          scheduledPickupTime,
          { requireCustomerRole: true }
        );

        const orderInsert = await trx.raw(`
          INSERT INTO "FoodTruck"."Orders"
          ("userId","truckId","orderStatus","totalPrice","scheduledPickupTime","estimatedEarliestPickup")
          VALUES (?, ?, 'pending', ?, ?, NOW())
          RETURNING *`,
          [
            validated.userId,
            validated.truckId,
            validated.totalPrice,
            validated.pickupTime
          ]
        );

        const order = orderInsert.rows[0];

        for (const it of validated.cartItems) {
          await trx.raw(`
            INSERT INTO "FoodTruck"."OrderItems"
            ("orderId","itemId","quantity","unitPrice","lineTotal")
            VALUES (?, ?, ?, ?, ?)`,
            [
              order.orderId,
              it.itemId,
              it.quantity,
              it.unitPrice,
              it.lineTotal
            ]
          );
        }

        await trx.raw(
          `DELETE FROM "FoodTruck"."Carts" WHERE "userId" = ?`,
          [validated.userId]
        );

        return {
          orderId: order.orderId,
          truckId: order.truckId,
          totalPrice: Number(order.totalPrice),
          orderStatus: order.orderStatus,
          scheduledPickupTime: order.scheduledPickupTime,
          itemCount: validated.cartItems.length
        };
      });

      return res.status(201).json({
        message: 'Order placed successfully',
        order: result
      });

    } catch (err) {
      console.error("orderNew error:", err);
      return res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
      });
    }
  });


  // ---------------------------
  // GET ALL USER ORDERS
  // GET /api/v1/order/myOrders
  // ---------------------------
  app.get('/api/v1/order/myOrders', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const userId = user.userId;

      const result = await db.raw(`
        SELECT o."orderId", o."truckId", t."truckName",
               o."orderStatus", o."totalPrice",
               o."scheduledPickupTime", o."estimatedEarliestPickup",
               o."createdAt"
        FROM "FoodTruck"."Orders" o
        JOIN "FoodTruck"."Trucks" t ON o."truckId" = t."truckId"
        WHERE o."userId" = ?
        ORDER BY o."createdAt" DESC`,
        [userId]
      );

      return res.json({
        orders: result.rows,
        count: result.rows.length
      });

    } catch (err) {
      console.error("myOrders error:", err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });


  // ---------------------------
  // GET ORDER DETAILS
  // GET /api/v1/order/details/:orderId
  // ---------------------------
  app.get('/api/v1/order/details/:orderId', async (req, res) => {
    try {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const orderId = Number(req.params.orderId);
      if (!orderId)
        return res.status(400).json({ error: 'Invalid orderId' });

      const orderRes = await db.raw(`
        SELECT o."orderId", o."userId", o."truckId", t."truckName",
               o."orderStatus", o."totalPrice", o."scheduledPickupTime",
               o."estimatedEarliestPickup", o."createdAt"
        FROM "FoodTruck"."Orders" o
        JOIN "FoodTruck"."Trucks" t ON o."truckId" = t."truckId"
        WHERE o."orderId" = ?`,
        [orderId]
      );

      if (orderRes.rows.length === 0)
        return res.status(404).json({ error: 'Order not found' });

      const order = orderRes.rows[0];

      if (order.userId !== user.userId)
        return res.status(403).json({ error: 'Forbidden' });

      const itemsRes = await db.raw(`
        SELECT oi."orderItemId", oi."itemId", oi."quantity",
               oi."unitPrice", oi."lineTotal",
               m."name", m."description", m."category"
        FROM "FoodTruck"."OrderItems" oi
        JOIN "FoodTruck"."MenuItems" m ON oi."itemId" = m."itemId"
        WHERE oi."orderId" = ?
        ORDER BY oi."orderItemId" ASC`,
        [orderId]
      );

      return res.json({
        order,
        items: itemsRes.rows,
        itemCount: itemsRes.rows.length
      });

    } catch (err) {
      console.error("orderDetails error:", err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  // ========================================
// OWNER: VIEW ORDER DETAILS
// GET /api/v1/order/truckOwner/:orderId
// ========================================
app.get('/api/v1/order/truckOwner/:orderId', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== 'truckOwner')
      return res.status(403).json({ error: 'Forbidden' });

    const orderId = Number(req.params.orderId);
    if (!orderId)
      return res.status(400).json({ error: 'Invalid orderId' });

    // Get order info + verify ownership
    const orderRes = await db.raw(
      `SELECT o.*, t."truckName", t."ownerId"
       FROM "FoodTruck"."Orders" o
       JOIN "FoodTruck"."Trucks" t ON o."truckId" = t."truckId"
       WHERE o."orderId" = ?`,
      [orderId]
    );

    if (orderRes.rows.length === 0)
      return res.status(404).json({ error: 'Order not found' });

    const order = orderRes.rows[0];

    // ensure this owner owns the truck for this order
    if (order.ownerId !== user.userId)
      return res.status(403).json({ error: 'Not your truck' });

    // Get items inside this order
    const itemsRes = await db.raw(
      `SELECT oi."orderItemId", oi."itemId", oi."quantity",
              oi."unitPrice", oi."lineTotal",
              m."name", m."description", m."category"
       FROM "FoodTruck"."OrderItems" oi
       JOIN "FoodTruck"."MenuItems" m ON oi."itemId" = m."itemId"
       WHERE oi."orderId" = ?
       ORDER BY oi."orderItemId" ASC`,
      [orderId]
    );

    return res.json({
      order,
      items: itemsRes.rows,
      itemCount: itemsRes.rows.length
    });

  } catch (err) {
    console.error("ownerOrderDetails error:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// ========================================
// OWNER: VIEW ALL ORDERS FOR MY TRUCK(S)
// GET /api/v1/order/truckOrders
// ========================================
app.get('/api/v1/order/truckOrders', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== 'truckOwner') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ownerId = user.userId;

    // Find owner’s trucks
    const truckRes = await db.raw(
      `SELECT "truckId", "truckName"
       FROM "FoodTruck"."Trucks"
       WHERE "ownerId" = ?`,
      [ownerId]
    );

    if (truckRes.rows.length === 0) {
      return res.status(404).json({ error: "No trucks found for this owner" });
    }

    const truckIds = truckRes.rows.map(t => t.truckId);

    // Fetch all orders for these trucks
    const ordersRes = await db.raw(
      `SELECT o."orderId", o."truckId", t."truckName",
              o."orderStatus", o."totalPrice",
              o."scheduledPickupTime", o."estimatedEarliestPickup",
              o."createdAt"
       FROM "FoodTruck"."Orders" o
       JOIN "FoodTruck"."Trucks" t ON o."truckId" = t."truckId"
       WHERE o."truckId" = ANY(?)
       ORDER BY o."createdAt" DESC`,
      [truckIds]
    );

    return res.json({
      trucks: truckRes.rows,
      orders: ordersRes.rows,
      orderCount: ordersRes.rows.length
    });

  } catch (err) {
    console.error("truckOrders error:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// ========================================
// OWNER: UPDATE ORDER STATUS
// PUT /api/v1/order/updateStatus/:orderId
// body: { orderStatus }
// ========================================
app.put('/api/v1/order/updateStatus/:orderId', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== "truckOwner") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const orderId = Number(req.params.orderId);
    const { orderStatus } = req.body;

    if (!orderId || !orderStatus) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch the order
    const orderRes = await db.raw(
      `SELECT o."orderId", o."truckId", t."ownerId"
       FROM "FoodTruck"."Orders" o
       JOIN "FoodTruck"."Trucks" t ON o."truckId" = t."truckId"
       WHERE o."orderId" = ?`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderRes.rows[0];

    // Must be the owner of this truck
    if (order.ownerId !== user.userId) {
      return res.status(403).json({ error: "Not authorized to modify this order" });
    }

    // Update status
    const updateRes = await db.raw(
      `UPDATE "FoodTruck"."Orders"
       SET "orderStatus" = ?
       WHERE "orderId" = ?
       RETURNING *`,
      [orderStatus, orderId]
    );

    return res.json({
      message: "Order status updated",
      order: updateRes.rows[0]
    });

  } catch (err) {
    console.error("updateOrderStatus error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// ========================================
// MENU ITEM MANAGEMENT — Rodaina
// ========================================

// ---------------------------
// CREATE MENU ITEM
// POST /api/v1/menuItem/new
// ---------------------------
app.post("/api/v1/menuItem/new", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== "truckOwner")
      return res.status(403).json({ error: "Only truck owners can create menu items" });

    const { truckId, name, description, price, category } = req.body;

    if (!truckId || !name || !price || !category)
      return res.status(400).json({ error: "Missing required fields" });

    const result = await db.raw(
      `INSERT INTO "FoodTruck"."MenuItems"
       ("truckId","name","description","price","category","status")
       VALUES (?, ?, ?, ?, ?, 'available')
       RETURNING *`,
      [truckId, name, description || null, price, category]
    );

    return res.json({
      message: "Menu item created",
      menuItem: result.rows[0],
    });

  } catch (err) {
    console.error("menuItemNew error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// ---------------------------
// VIEW ALL MENU ITEMS FOR MY TRUCK
// GET /api/v1/menuItem/view
// ---------------------------
app.get("/api/v1/menuItem/view", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== "truckOwner")
      return res.status(403).json({ error: "Forbidden" });

    const ownerId = user.userId;

    // find truckId of owner
    const truckRes = await db.raw(
      `SELECT "truckId"
       FROM "FoodTruck"."Trucks"
       WHERE "ownerId" = ?`,
      [ownerId]
    );

    if (truckRes.rows.length === 0)
      return res.status(404).json({ error: "No truck found for this owner" });

    const truckId = truckRes.rows[0].truckId;

    const result = await db.raw(
      `SELECT *
       FROM "FoodTruck"."MenuItems"
       WHERE "truckId" = ?
       ORDER BY "createdAt" DESC`,
      [truckId]
    );

    return res.json({ menuItems: result.rows });

  } catch (err) {
    console.error("menuItemView error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// ---------------------------
// VIEW SPECIFIC ITEM
// GET /api/v1/menuItem/view/:itemId
// ---------------------------
app.get("/api/v1/menuItem/view/:itemId", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== "truckOwner")
      return res.status(403).json({ error: "Forbidden" });

    const itemId = Number(req.params.itemId);

    const result = await db.raw(
      `SELECT *
       FROM "FoodTruck"."MenuItems"
       WHERE "itemId" = ?`,
      [itemId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Item not found" });

    return res.json({ menuItem: result.rows[0] });

  } catch (err) {
    console.error("menuItemViewOne error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// ---------------------------
// EDIT MENU ITEM
// PUT /api/v1/menuItem/edit/:itemId
// ---------------------------
app.put("/api/v1/menuItem/edit/:itemId", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== "truckOwner")
      return res.status(403).json({ error: "Forbidden" });

    const itemId = Number(req.params.itemId);

    // Allowed fields to update
    const fields = ["name", "description", "price", "category", "status"];
    const updates = [];
    const values = [];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`"${field}" = ?`);
        values.push(req.body[field]);
      }
    });

    if (updates.length === 0)
      return res.status(400).json({ error: "No fields provided to update" });

    values.push(itemId);

    const result = await db.raw(
      `UPDATE "FoodTruck"."MenuItems"
       SET ${updates.join(", ")}
       WHERE "itemId" = ?
       RETURNING *`,
      values
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Item not found" });

    return res.json({
      message: "Menu item updated",
      menuItem: result.rows[0],
    });

  } catch (err) {
    console.error("menuItemEdit error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// ---------------------------
// DELETE MENU ITEM
// DELETE /api/v1/menuItem/delete/:itemId
// ---------------------------
app.delete("/api/v1/menuItem/delete/:itemId", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== "truckOwner")
      return res.status(403).json({ error: "Forbidden" });

    const itemId = Number(req.params.itemId);

    const result = await db.raw(
      `DELETE FROM "FoodTruck"."MenuItems"
       WHERE "itemId" = ?
       RETURNING *`,
      [itemId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Item not found" });

    return res.json({
      message: "Menu item deleted",
      deleted: result.rows[0],
    });

  } catch (err) {
    console.error("menuItemDelete error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});




} // END handlePrivateBackendApi

module.exports = { handlePrivateBackendApi };
