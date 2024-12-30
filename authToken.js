const jwt = require('jsonwebtoken');

// Middleware to check authentication
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers['authorization']; // Use cookies or Authorization header
  if (!token) {
    return res.status(401).redirect('/admin/login'); // Redirect to login if token is missing
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).redirect('/admin/login'); // Redirect if token is invalid or expired
    }
    req.user = user; // Attach user info to the request object
    next();
  });
}

module.exports = authenticateToken;
