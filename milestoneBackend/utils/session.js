const db = require('../connectors/db');

/**
 * Read token from Authorization header ("Bearer TOKEN") or cookie "session_token".
 * Return the token string or null.
 */
function getSessionToken(req) {
  // 1) Authorization header
  if (req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }

  // 2) Cookie fallback (cookie name used in your login handler)
  if (req.cookies && req.cookies.session_token) {
    return req.cookies.session_token;
  }

  return null;
}

/**
 * Validate token in DB and return a user-shaped object:
 * { userId: <number>, token: <string>, role?: <string> }
 * or null if not valid.
 */
async function getUser(req) {
  try {
    const token = getSessionToken(req);
    if (!token) {
      console.log('session token is null');
      return null;
    }

    console.log('Incoming session token:', token);

    const result = await db.raw(
      `SELECT * FROM "FoodTruck"."Sessions" WHERE "token" = ?`,
      [token]
    );

    if (!result || !result.rows || result.rows.length === 0) {
      console.log('No session found for token');
      return null;
    }

    const session = result.rows[0];

    // Optionally fetch the user role if you need it for authorization checks
    const userRes = await db.raw(
      `SELECT "userId", "role", "email", "name" FROM "FoodTruck"."Users" WHERE "userId" = ?`,
      [session.userId]
    );

    const userRow = (userRes && userRes.rows && userRes.rows[0]) || null;

    return {
      userId: session.userId,
      token,
      role: userRow ? userRow.role : undefined,
      email: userRow ? userRow.email : undefined,
      name: userRow ? userRow.name : undefined
    };
  } catch (err) {
    console.error('getUser error:', err);
    return null;
  }
}

module.exports = {
  getSessionToken,
  getUser
};
