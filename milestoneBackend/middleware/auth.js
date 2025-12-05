const { getSessionToken } = require("../utils/session");
const db = require("../connectors/db");

async function authMiddleware(req, res, next) {
  const token = getSessionToken(req);

  if (!token) {
    console.log("❌ authMiddleware: token is null");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("➡️ authMiddleware token:", token);

  const result = await db.raw(
    `SELECT * FROM "FoodTruck"."Sessions" WHERE "token" = ?`,
    [token]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const session = result.rows[0];

  if (new Date() > session.expiresAt) {
    return res.status(401).json({ error: "Session expired" });
  }

  req.user = { userId: session.userId };
  next();
}

module.exports = { authMiddleware };
