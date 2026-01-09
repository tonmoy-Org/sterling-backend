const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const vehicleStatusHistorySchema = new Schema({
    status: {
        type: String,
        enum: ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'OUT_OF_SERVICE'],
        required: true
    },
    changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const vehicleAssignmentHistorySchema = new Schema({
    technicianId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    technicianName: {
        type: String
    },
    assignedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedDate: {
        type: Date,
        default: Date.now
    },
    unassignedDate: {
        type: Date
    },
    unassignedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: {
        type: String
    }
});

const vehicleSchema = new Schema({
    truckNumber: {
        type: String,
        required: [true, 'Truck number is required'],
        unique: true,
        trim: true,
        uppercase: true
    },
    licensePlate: {
        type: String,
        required: [true, 'License plate is required'],
        unique: true,
        trim: true,
        uppercase: true
    },
    vin: {
        type: String,
        trim: true,
        uppercase: true
    },
    vehicleType: {
        type: String,
        required: [true, 'Vehicle type is required'],
        default: 'SERVICE_TRUCK'
    },
    make: {
        type: String,
        trim: true
    },
    model: {
        type: String,
        trim: true
    },
    year: {
        type: Number,
        min: 1900,
        max: new Date().getFullYear() + 1
    },
    color: {
        type: String,
        trim: true
    },
    capacity: {
        type: Number,
        min: 0
    },
    capacityUnit: {
        type: String,
        default: 'GALLONS'
    },
    pumpType: {
        type: String,
        default: 'NONE'
    },
    odometer: {
        type: Number,
        default: 0,
        min: 0
    },
    fuelType: {
        type: String,
        default: 'DIESEL'
    },
    status: {
        type: String,
        default: 'AVAILABLE',
        required: true
    },
    assignedTechnicianId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    currentAssignment: {
        technicianId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        technicianName: {
            type: String
        },
        assignmentDate: {
            type: Date
        },
        jobId: {
            type: Schema.Types.ObjectId,
            ref: 'Job'
        },
        jobNumber: {
            type: String
        }
    },
    lastKnownLocation: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        },
        address: {
            type: String
        },
        timestamp: {
            type: Date
        }
    },
    lastMaintenanceDate: {
        type: Date
    },
    nextMaintenanceDate: {
        type: Date
    },
    maintenanceInterval: {
        type: Number,
        default: 90,
        min: 1
    },
    maintenanceNotes: {
        type: String
    },
    photos: [{
        url: {
            type: String
        },
        caption: {
            type: String
        },
        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    documents: [{
        type: {
            type: String,
            enum: ['INSURANCE', 'REGISTRATION', 'INSPECTION', 'MAINTENANCE_RECORD', 'OTHER']
        },
        name: {
            type: String
        },
        url: {
            type: String
        },
        expiryDate: {
            type: Date
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    activeIssues: [{
        type: Schema.Types.ObjectId,
        ref: 'VehicleIssue'
    }],
    statusHistory: [vehicleStatusHistorySchema],
    assignmentHistory: [vehicleAssignmentHistorySchema],
    notes: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

vehicleSchema.index({ truckNumber: 1 });
vehicleSchema.index({ licensePlate: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ vehicleType: 1 });
vehicleSchema.index({ assignedTechnicianId: 1 });
vehicleSchema.index({ 'lastKnownLocation.coordinates': '2dsphere' });

vehicleSchema.virtual('assignedTechnician', {
    ref: 'User',
    localField: 'assignedTechnicianId',
    foreignField: '_id',
    justOne: true
});

vehicleSchema.virtual('openIssuesCount').get(function () {
    return this.activeIssues ? this.activeIssues.length : 0;
});

vehicleSchema.pre('save', function (next) {
    if (this.isModified('odometer') && this.odometer > 0) {
        const maintenanceMileageInterval = 5000;
        const lastMaintenanceMileage = this.lastMaintenanceMileage || 0;

        if (this.odometer - lastMaintenanceMileage >= maintenanceMileageInterval) {
            this.nextMaintenanceDate = new Date();
            this.maintenanceNotes = `Maintenance due at ${this.odometer} miles`;
        }
    }

    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Vehicle', vehicleSchema);