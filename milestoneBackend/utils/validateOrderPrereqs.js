// utils/validateOrderPrereqs.js
// Single exported async function — validates cart, pickup time, truck & menu availability and relationships.

module.exports = async function validateOrderPrereqs(client, userId, truckId, scheduledPickupTime, options = {}) {
  // options: { requireCustomerRole: boolean } - optional role check
  if (!userId) throw { status: 401, message: 'Unauthorized' };

  // validate pickup time
  const pickup = new Date(scheduledPickupTime);
  if (isNaN(pickup.getTime())) throw { status: 400, message: 'scheduledPickupTime is invalid' };
  if (pickup <= new Date()) throw { status: 400, message: 'scheduledPickupTime must be in the future' };

  // optional role check (if you want to ensure only customers place orders)
  if (options.requireCustomerRole) {
    const userRes = await client.query(
      'SELECT "userId", "role" FROM "FoodTruck"."Users" WHERE "userId" = $1',
      [userId]
    );
    if (userRes.rowCount === 0) throw { status: 401, message: 'Unauthorized (user not found)' };
    if (userRes.rows[0].role !== 'customer') throw { status: 403, message: 'Only customers can place orders' };
  }

  // Fetch cart items joined with menu items
  const cartRes = await client.query(
    `SELECT c."cartId", c."itemId", c."quantity", c."price" AS "unitPrice",
            m."name", m."status" AS "itemStatus", m."truckId"
     FROM "FoodTruck"."Carts" c
     JOIN "FoodTruck"."MenuItems" m ON c."itemId" = m."itemId"
     WHERE c."userId" = $1`,
    [userId]
  );

  if (cartRes.rowCount === 0) {
    throw { status: 400, message: 'Cart is empty' };
  }

  // Validate truck existence and availability
  if (!truckId || !Number.isInteger(Number(truckId)) || Number(truckId) <= 0) {
    throw { status: 400, message: 'Invalid truckId' };
  }

  const truckRes = await client.query(
    `SELECT "truckId", "truckStatus", "orderStatus" FROM "FoodTruck"."Trucks" WHERE "truckId" = $1`,
    [truckId]
  );
  if (truckRes.rowCount === 0) throw { status: 404, message: 'Truck not found' };

  const truck = truckRes.rows[0];
  if (truck.truckStatus !== 'available' || truck.orderStatus !== 'available') {
    throw { status: 400, message: 'Truck is not available for orders' };
  }

  // Validate each cart item: positive quantity, belongs to the requested truck, item is available
  const cartItems = [];
  let totalPrice = 0;

  for (const row of cartRes.rows) {
    const qty = Number(row.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw { status: 400, message: `Invalid quantity for itemId ${row.itemId}` };
    }

    if (Number(row.truckId) !== Number(truckId)) {
      throw { status: 400, message: 'Cart contains items from a different truck' };
    }

    if (row.itemStatus !== 'available') {
      throw { status: 400, message: `Menu item "${row.name}" is not available` };
    }

    const unitPrice = Number(row.unitPrice);
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      throw { status: 400, message: `Invalid price for itemId ${row.itemId}` };
    }

    const lineTotal = Number((unitPrice * qty).toFixed(2));
    totalPrice += lineTotal;

    cartItems.push({
      cartId: row.cartId,
      itemId: row.itemId,
      name: row.name,
      unitPrice,
      quantity: qty,
      lineTotal,
      truckId: row.truckId,
    });
  }

  totalPrice = Number(totalPrice.toFixed(2));

  // Return structured validated data to be used by the caller
  return {
    userId,
    truckId: Number(truckId),
    pickupTime: pickup,
    cartItems,
    totalPrice,
  };
};
