// db.js
const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.100.10',      // your PostgreSQL server IP
  port: 5432,
  user: 'postgres',            // or a team user
  password: '1234',            // your PostgreSQL password
  database: 'orderna_db'
});

module.exports = pool;
// index.js
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

// TEST ENDPOINT: Get all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "FoodTruck"."Users";');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// SIGNUP endpoint
app.post('/api/users/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const result = await pool.query(
      'INSERT INTO "FoodTruck"."Users"(name, email, password) VALUES($1, $2, $3) RETURNING *',
      [name, email, password]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// GET all trucks
app.get('/api/trucks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "FoodTruck"."Trucks";');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ADD truck (Truck Owner)
app.post('/api/trucks/add', async (req, res) => {
  try {
    const { name, location } = req.body;
    const result = await pool.query(
      'INSERT INTO "FoodTruck"."Trucks"(name, location) VALUES($1, $2) RETURNING *',
      [name, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
