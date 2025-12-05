function handlePublicFrontEndView(app) {

    // Landing page → redirect to login
    app.get('/', function(req, res) {
        return res.redirect('/login');
    });

    // Login page
    app.get('/login', function(req, res) {
        return res.render('login');
    });

    // Register page
    app.get('/register', function(req, res) {
        return res.render('register');
    });
}

module.exports = { handlePublicFrontEndView };
