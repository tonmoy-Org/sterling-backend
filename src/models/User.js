const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

const deviceSchema = new mongoose.Schema({
  browser: {
    type: String
  },
  browserVersion: {
    type: String
  },
  os: {
    type: String
  },
  osVersion: {
    type: String
  },
  deviceType: {
    type: String
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ['superadmin', 'manager', 'tech'],
      default: 'tech'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    department: {
      type: String,
      default: 'General'
    },
    devices: {
      type: [deviceSchema],
      default: []
    }
  },
  { 
    timestamps: true 
  }
);

// Compound index for per-user device uniqueness
// This ensures a deviceId is unique within a user's devices array
userSchema.index({ '_id': 1, 'devices.deviceId': 1 }, { 
  unique: true,
  partialFilterExpression: { 'devices.deviceId': { $exists: true } }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcryptjs.compare(enteredPassword, this.password);
};

// Method to add a device with validation
userSchema.methods.addDevice = async function(deviceData) {
  if (!deviceData.deviceId || deviceData.deviceId.trim() === '') {
    throw new Error('Device ID is required');
  }
  
  // Check if device already exists for this user
  const existingDevice = this.devices.find(
    device => device.deviceId === deviceData.deviceId
  );
  
  if (existingDevice) {
    // Update existing device
    Object.assign(existingDevice, deviceData);
    existingDevice.date = new Date();
  } else {
    // Add new device
    this.devices.push({
      ...deviceData,
      date: new Date()
    });
  }
  
  return await this.save();
};

// Method to remove a device
userSchema.methods.removeDevice = async function(deviceId) {
  const initialLength = this.devices.length;
  this.devices = this.devices.filter(device => device.deviceId !== deviceId);
  
  if (this.devices.length === initialLength) {
    throw new Error('Device not found');
  }
  
  return await this.save();
};

// Method to get device by ID
userSchema.methods.getDevice = function(deviceId) {
  return this.devices.find(device => device.deviceId === deviceId);
};

// Static method to cleanup null deviceIds (run once)
userSchema.statics.cleanupNullDevices = async function() {
  return await this.updateMany(
    { "devices.deviceId": null },
    { $pull: { devices: { deviceId: null } } }
  );
};

// Create indexes when model is initialized
userSchema.post('init', async function() {
  try {
    await mongoose.model('User').createIndexes();
  } catch (error) {
    console.error('Error creating indexes:', error.message);
  }
});

module.exports = mongoose.model('User', userSchema);