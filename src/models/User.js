const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

const deviceSchema = new mongoose.Schema({
  browser: {
    type: String
  },
  deviceId: {
    type: String,
    required: true
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

userSchema.index({ '_id': 1, 'devices.deviceId': 1 }, {
  unique: true,
  partialFilterExpression: { 'devices.deviceId': { $exists: true } }
});

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

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcryptjs.compare(enteredPassword, this.password);
};

userSchema.methods.addDevice = async function (deviceData) {
  if (!deviceData.deviceId || deviceData.deviceId.trim() === '') {
    throw new Error('Device ID is required');
  }

  const existingDevice = this.devices.find(
    device => device.deviceId === deviceData.deviceId
  );

  if (existingDevice) {
    Object.assign(existingDevice, deviceData);
    existingDevice.date = new Date();
  } else {
    this.devices.push({
      ...deviceData,
      date: new Date()
    });
  }

  return await this.save();
};

userSchema.methods.removeDevice = async function (deviceId) {
  const initialLength = this.devices.length;
  this.devices = this.devices.filter(device => device.deviceId !== deviceId);

  if (this.devices.length === initialLength) {
    throw new Error('Device not found');
  }

  return await this.save();
};

userSchema.methods.getDevice = function (deviceId) {
  return this.devices.find(device => device.deviceId === deviceId);
};

userSchema.statics.cleanupNullDevices = async function () {
  return await this.updateMany(
    { "devices.deviceId": null },
    { $pull: { devices: { deviceId: null } } }
  );
};

userSchema.post('init', async function () {
  try {
    await mongoose.model('User').createIndexes();
  } catch (error) {
    console.error('Error creating indexes:', error.message);
  }
});

module.exports = mongoose.model('User', userSchema);