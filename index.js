require("dotenv").config(); // For environment variables
const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const pool = require('./db');
const cookieParser = require("cookie-parser");

const app = express();
const port = 3000;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const authenticateToken = require("./authToken");
const userRoutes = require("./userRoutes");
app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "admin/dashboard"),
  path.join(__dirname, "admin/login"),
]);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files from the "assets" directory
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Default route (root)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Create Appointment Table (if it doesn't exist)
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS Appointments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(50) NOT NULL,
    message VARCHAR(500)
  );
`;

// create USer Table
const createUserTableQuery = `
  CREATE TABLE IF NOT EXISTS Users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email)
  );
`;

// Create Appointments Table
async function createAppointmentTable() {
  try {
    await pool.query(createTableQuery);
    console.log("Appointment table created successfully.");
  } catch (error) {
    console.error("Error creating Users table:", error);
  }
}
// Create Users Table
async function createUsersTable() {
  try {
    await pool.query(createUserTableQuery);
    console.log("Users table created successfully.");
  } catch (error) {
    console.error("Error creating Users table:", error);
  }
}

async function createDefaultUser() {
  const name = "Admin";
  const email = "admin@example.com";
  const password = "password123"; // Change to a secure password
  const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

  const insertUserQuery = `
      INSERT INTO Users (name, email, password)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO NOTHING;
    `;

  try {
    await pool.query(insertUserQuery, [name, email, hashedPassword]);
    console.log("Default user created successfully.");
  } catch (error) {
    console.error("Error creating default user:", error);
  }
}
async function initialize() {
  await createUsersTable();
  await createDefaultUser();
  await createAppointmentTable();
}
initialize();
// Email Notification Function
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper to validate appointment data
const validateAppointmentData = (data) => {
  const { name, email, phone, category, date, time } = data;
  if (!name || !email || !phone || !category || !date || !time) {
    return false;
  }
  return true;
};
async function addAppointment({
  name,
  email,
  phone,
  category,
  date,
  time,
  message,
}) {
  const insertQuery = `
      INSERT INTO Appointments (name, email, phone, category, date, time, message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
  const values = [name, email, phone, category, date, time, message];
  const result = await pool.query(insertQuery, values);
  return result.rows[0];
}

app.post("/admin/dashboard/add-appointment", async (req, res) => {
  try {
    const { name, email, phone, category, date, time, message } = req.body;

    if (!validateAppointmentData(req.body)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing input fields." });
    }

    const savedAppointment = await addAppointment({
      name,
      email,
      phone,
      category,
      date,
      time,
      message,
    });

    // Fetch updated appointments
    const result = await pool.query(
      "SELECT * FROM Appointments ORDER BY date, time"
    );
    const appointments = result.rows;

    // Re-render the dashboard with updated appointments
    res.render("dashboard", {
      appointments,
      message: "Appointment added successfully!",
    });
  } catch (error) {
    console.error("Error adding appointment:", error);
    res.status(500).send("Error adding appointment.");
  }
});

// Route to handle form submission
app.post("/book-appointment", async (req, res) => {
  try {
    const { name, email, phone, category, date, time, message } = req.body;

    if (!validateAppointmentData(req.body)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing input fields." });
    }

    // Save appointment data in PostgreSQL
    const insertQuery = `
      INSERT INTO Appointments (name, email, phone, category, date, time, message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [name, email, phone, category, date, time, message];
    const result = await pool.query(insertQuery, values);
    const savedAppointment = result.rows[0];

    // Send email to the client (the business or admin receiving the booking)
    const clientEmailContent = `
      <h2>New Appointment Booking</h2>
      <p>Dear Admin,</p>
      <p>You have received a new appointment booking. Here are the details:</p>
      <ul>
        <li><strong>Customer Name:</strong> ${name}</li>
        <li><strong>Phone:</strong> ${phone}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Category:</strong> ${category}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${time}</li>
        <li><strong>Message:</strong> ${message || "N/A"}</li>
      </ul>
    `;

    await transporter.sendMail({
      from: '"Luxe Style Barber" <no-reply@luxestylebarber.com>',
      to: process.env.RECEIVER_EMAIL,
      subject: "New Appointment Booking",
      html: clientEmailContent,
    });

    // Send confirmation email to the user
    const userEmailContent = `
      <h2>Your Appointment Booking</h2>
      <p>Dear ${name},</p>
      <p>Thank you for booking your appointment. Here are the details:</p>
      <ul>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${time}</li>
        <li><strong>Phone:</strong> ${phone}</li>
        <li><strong>Message:</strong> ${message || "N/A"}</li>
      </ul>
      <p>We look forward to seeing you!</p>
    `;

    await transporter.sendMail({
      from: '"Luxe Style Barber" <no-reply@luxestylebarber.com>',
      to: email,
      subject: "Appointment Confirmation",
      html: userEmailContent,
    });

    res.render("dashboard", { savedAppointment });
  } catch (err) {
    console.error("Error saving appointment or sending email:", err);
    res
      .status(500)
      .json({ error: "Failed to save appointment or send emails." });
  }
});

app.get("/admin/dashboard", authenticateToken, async (req, res) => {
  const userName = req.cookies.userName || 'Guest'; // Get user's name from cookies

  try {
    const result = await pool.query(`
            SELECT id, name, time, email, category, phone, message, TO_CHAR(date, 'YYYY-MM-DD') AS date
            FROM Appointments
            ORDER BY date, time
          `);
    const appointments = result.rows;

    // Render the dashboard template with the appointments data
    res.render("dashboard", { appointments, userName });
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).send("Error fetching appointments.");
  }
});

// edit data
app.get("/api/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, name, time, email, category, phone, message, TO_CHAR(date, 'YYYY-MM-DD') AS date FROM Appointments WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Appointment not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching appointment:", error);
    res.status(500).json({ error: "Failed to fetch appointment." });
  }
});

app.put("/api/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, category, date, time, message } = req.body;

    const result = await pool.query(
      "UPDATE Appointments SET name = $1, email = $2, phone = $3, category = $4, date = $5, time = $6, message = $7 WHERE id = $8 RETURNING *",
      [name, email, phone, category, date, time, message, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Appointment not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating appointment:", error);
    res.status(500).json({ error: "Failed to update appointment." });
  }
});

// delete appointment
app.delete("/api/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM Appointments WHERE id = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Appointment not found." });
    }

    res.json({ message: "Appointment deleted successfully." });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ error: "Failed to delete appointment." });
  }
});

app.get("/admin/login", (req, res) => {
  res.render("login", { error: null }); // Render login.ejs in admin/login folder
});

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Fetch user by email
    const result = await pool.query("SELECT * FROM Users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    // If user not found or password doesn't match
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res
        .status(401)
        .render("login", { error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role }, // Payload
      process.env.JWT_SECRET, // Secret key
      { expiresIn: "1h" } // Token expiry
    );

    // Send the token in cookies
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 }); // 1 hour
    res.cookie('userName', user.name, { maxAge: 3600000 }); // Store user name in cookies for 1 hour
    res.redirect("/admin/dashboard"); // Redirect to dashboard
  } catch (error) {
    console.error("Error during login:", error);
    res
      .status(500)
      .render("login", { error: "An error occurred. Please try again." });
  }
});

app.get("/admin/logout", (req, res) => {
  res.clearCookie("token"); // Clear the token cookie
  res.redirect("/admin/login"); // Redirect to login page
});

// users 
app.use("/admin/users", userRoutes);

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
