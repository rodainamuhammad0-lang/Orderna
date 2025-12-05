const express = require('express');
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");

require('dotenv').config();

// ROUTES
const { handlePublicBackendApi } = require('./routes/public/api');
const { handlePrivateBackendApi } = require('./routes/private/api');
const { handlePublicFrontEndView } = require('./routes/public/view');
const { handlePrivateFrontEndView } = require('./routes/private/view');
const { authMiddleware } = require('./middleware/auth');

const PORT = process.env.PORT || 3000;

// =======================================
// ⭐ REQUIRED MIDDLEWARE (IN CORRECT ORDER)
// =======================================

// 1. Parse cookies first
app.use(cookieParser());

// 2. Parse JSON and form data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 3. Enable CORS with cookie support
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

// 4. Views and static files
app.set('views', './views');
app.set('view engine', 'hjs');
app.use(express.static('./public'));

// =======================================
// PUBLIC ROUTES (NO LOGIN REQUIRED)
// =======================================
handlePublicBackendApi(app);     // register + login APIs
handlePublicFrontEndView(app);   // login + register pages

// =======================================
// PRIVATE ROUTES (LOGIN REQUIRED)
// =======================================
app.use(authMiddleware);         // protect all routes below this line
handlePrivateBackendApi(app);    // cart APIs
handlePrivateFrontEndView(app);  // dashboard and other logged-in pages

// =======================================
// START SERVER
// =======================================
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
