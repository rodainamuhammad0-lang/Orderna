const { v4 } = require('uuid');
const db = require('../../connectors/db');
const axios = require('axios');

function handlePublicBackendApi(app) {

    // Register HTTP endpoint to create new user
    app.post('/api/v1/user', async function(req, res) {
      // Check if user already exists in the system
      const userExists = await db.select('*').from('FoodTruck.Users').where('email', req.body.email);
      //console.log(userExists)
      if (userExists.length > 0) {
        return res.status(400).send('user exists');
      }
      
      try {
        const newUser = req.body;
        const user = await db('FoodTruck.Users').insert(newUser).returning('*');
        return res.status(200).json(user);
      } catch (e) {
        console.log(e.message);
        return res.status(400).send('Could not register user');
      }
    });

    // Register HTTP endpoint to create new user
    app.post('/api/v1/user/login', async function(req, res) {
      // get users credentials from the JSON body
      const { email, password } = req.body
      if (!email) {
        // If the email is not present, return an HTTP unauthorized code
        return res.status(400).send('email is required');
      }
      if (!password) {
        // If the password is not present, return an HTTP unauthorized code
        return res.status(400).send('Password is required');
      }

      // validate the provided password against the password in the database
      // if invalid, send an unauthorized code
      let user = await db.select('*').from('FoodTruck.Users').where('email', email);
      if (user.length == 0) {
        return res.status(400).send('user does not exist');
      }
      user = user[0];
      if (user.password !== password) {
        return res.status(400).send('Password does not match');
      }

      // set the expiry time as 30 minutes after the current time
      const token = v4();
      const currentDateTime = new Date();
      const expiresAt = new Date(+currentDateTime + 18000000); // expire in 3 minutes

      // create a session containing information about the user and expiry time
      const session = {
        userId: user.userId,
        token,
        expiresAt,
      };
      try {
        await db('FoodTruck.Sessions').insert(session);
        // In the response, set a cookie on the client with the name "session_cookie"
        // and the value as the UUID we generated. We also set the expiration time.
        axios.defaults.headers.common['Cookie'] = `session_token=${token};expires=${expiresAt}`;
        return res.cookie("session_token", token, { expires: expiresAt }).status(200).send('login successful');
      } catch (e) {
        console.log(e.message);
        return res.status(400).send('Could not register user');
      }
    });
    // ================================
// VIEW MENU ITEMS FOR SPECIFIC TRUCK
// GET /api/v1/menuItem/truck/:truckId
// ================================
app.get('/api/v1/menuItem/truck/:truckId', async (req, res) => {
  try {
    const truckId = Number(req.params.truckId);
    if (!truckId) {
      return res.status(400).send('Invalid truckId');
    }

    const result = await db.raw(
      `SELECT *
       FROM "FoodTruck"."MenuItems"
       WHERE "truckId" = ?
       ORDER BY "createdAt" DESC`,
      [truckId]
    );

    return res.status(200).json({
      truckId,
      menuItems: result.rows
    });

  } catch (err) {
    console.log('Error fetching menu items by truck:', err.message);
    return res.status(500).send('Could not fetch menu items');
  }
});




// ==========================================
// VIEW MENU ITEMS BY TRUCK + CATEGORY FILTER
// GET /api/v1/menuItem/truck/:truckId/category/:category
// ==========================================
app.get('/api/v1/menuItem/truck/:truckId/category/:category', async (req, res) => {
  try {
    const truckId = Number(req.params.truckId);
    const category = req.params.category;

    if (!truckId || !category) {
      return res.status(400).send('truckId and category are required');
    }

    const result = await db.raw(
      `SELECT *
       FROM "FoodTruck"."MenuItems"
       WHERE "truckId" = ?
         AND "category" ILIKE ?
       ORDER BY "createdAt" DESC`,
      [truckId, `%${category}%`]
    );

    return res.status(200).json({
      truckId,
      category,
      menuItems: result.rows
    });

  } catch (err) {
    console.log('Error filtering menu items:', err.message);
    return res.status(500).send('Could not fetch filtered menu');
  }
});





};


module.exports = {handlePublicBackendApi};
