const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('./db');
const router = express.Router();

// GET: Retrieve all users
router.get('/', async (req, res) => {
    const userName = req.cookies.userName || 'Guest'; // Get user's name from cookies

  try {
    const query = 'SELECT * FROM Users ORDER BY created_at DESC';
    const result = await pool.query(query);
    res.render('user', { users: result.rows, userName }); // Render `user.ejs` with user data
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Error fetching users.');
  }
});

// POST: Create a new user
router.post('/', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // Hash password
    const query = `
      INSERT INTO Users (name, email, password)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await pool.query(query, [name, email, hashedPassword]);
    res.redirect('/admin/users'); // Redirect back to the user management page
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).send('Error creating user.');
  }
});

// PUT: Update an existing user
router.post('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, password } = req.body;
  
    try {
      const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
  
      const query = `
        UPDATE Users
        SET
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          password = COALESCE($3, password),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *;
      `;
      const result = await pool.query(query, [name, email, hashedPassword, id]);
  
      if (result.rows.length === 0) {
        return res.status(404).send('User not found.');
      }
  
      res.redirect('/admin/users'); // Redirect back to the user management page
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).send('Error updating user.');
    }
  });
  

// DELETE: Delete a user
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = 'DELETE FROM Users WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found.');
    }

    res.json({ message: 'User deleted successfully', user: result.rows[0] });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Error deleting user.');
  }
});

module.exports = router;
