const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  browser: String,
  browserVersion: String,
  os: String,
  osVersion: String,
  deviceType: String,
  date: Date,
});

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    password: { type: String, select: false },
    role: { type: String, enum: ['superadmin', 'manager', 'tech'], default: 'tech' },
    isActive: Boolean,
    department: String,
    devices: { type: [deviceSchema], default: [] },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcryptjs.genSalt(10);
  this.password = await bcryptjs.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcryptjs.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
