const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const vehicleIssueRoutes = require('./routes/vehicleIssueRoutes');
const dashboardRoutes = require('./routes/locatesRoutes');

const app = express();

app.use(
  cors({
    origin: 'https://sterling-dashboard-snowy.vercel.app' ,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/vehicle-issues', vehicleIssueRoutes);
app.use('/api/locates', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ success: false, message: 'Internal server error' });
});

module.exports = app;
