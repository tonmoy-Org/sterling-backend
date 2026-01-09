const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const issueNoteSchema = new Schema({
    text: {
        type: String,
        required: [true, 'Note content is required'],
        trim: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByName: {
        type: String
    },
    isInternal: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const issueStatusHistorySchema = new Schema({
    status: {
        type: String,
        enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
        required: true
    },
    changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    changedByName: {
        type: String
    },
    notes: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const vehicleIssueSchema = new Schema({
    vehicleId: {
        type: Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: [true, 'Vehicle ID is required']
    },
    title: {
        type: String,
        required: [true, 'Issue title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
        type: String,
        required: [true, 'Issue description is required'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Issue type is required'],
        default: 'OTHER'
    },
    priority: {
        type: String,
        default: 'MEDIUM',
        required: true
    },
    status: {
        type: String,
        default: 'OPEN',
        required: true
    },
    statusHistory: [issueStatusHistorySchema],
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedToName: {
        type: String
    },
    assignedDate: {
        type: Date
    },
    reportedDate: {
        type: Date,
        default: Date.now
    },
    startDate: {
        type: Date
    },
    estimatedCompletionDate: {
        type: Date
    },
    resolvedDate: {
        type: Date
    },
    closedDate: {
        type: Date
    },
    images: [{
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
    estimatedCost: {
        type: Number,
        min: 0,
        default: 0
    },
    actualCost: {
        type: Number,
        min: 0,
        default: 0
    },
    partsUsed: [{
        partName: {
            type: String
        },
        partNumber: {
            type: String
        },
        quantity: {
            type: Number
        },
        unitCost: {
            type: Number
        },
        totalCost: {
            type: Number
        }
    }],
    laborHours: {
        type: Number,
        min: 0,
        default: 0
    },
    notes: [issueNoteSchema],
    reportedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedByName: {
        type: String
    },
    resolutionNotes: {
        type: String
    },
    resolutionMethod: {
        type: String
    },
    requiresAttention: {
        type: Boolean,
        default: false
    },
    isSafetyCritical: {
        type: Boolean,
        default: false
    },
    preventsDispatch: {
        type: Boolean,
        default: false
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

vehicleIssueSchema.index({ vehicleId: 1 });
vehicleIssueSchema.index({ status: 1 });
vehicleIssueSchema.index({ priority: 1 });
vehicleIssueSchema.index({ type: 1 });
vehicleIssueSchema.index({ reportedBy: 1 });
vehicleIssueSchema.index({ assignedTo: 1 });
vehicleIssueSchema.index({ reportedDate: -1 });
vehicleIssueSchema.index({ requiresAttention: 1 });
vehicleIssueSchema.index({ preventsDispatch: 1 });

vehicleIssueSchema.virtual('vehicle', {
    ref: 'Vehicle',
    localField: 'vehicleId',
    foreignField: '_id',
    justOne: true
});

vehicleIssueSchema.virtual('technician', {
    ref: 'User',
    localField: 'assignedTo',
    foreignField: '_id',
    justOne: true
});

vehicleIssueSchema.pre('save', function (next) {
    if (this.isModified('status') && this.status === 'RESOLVED' && !this.resolvedDate) {
        this.resolvedDate = new Date();
    }

    if (this.isModified('status') && this.status === 'CLOSED' && !this.closedDate) {
        this.closedDate = new Date();
    }

    if (this.isModified('status') && this.statusHistory) {
        this.statusHistory.push({
            status: this.status,
            changedBy: this.updatedBy || this.createdBy,
            changedByName: this.updatedByName || this.reportedByName,
            notes: `Status changed to ${this.status}`,
            createdAt: new Date()
        });
    }

    if (this.isModified('priority') || this.isModified('type')) {
        this.preventsDispatch = this.priority === 'CRITICAL' ||
            this.priority === 'HIGH' ||
            this.type === 'SAFETY_EQUIPMENT' ||
            this.type === 'BRAKES';
    }

    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('VehicleIssue', vehicleIssueSchema);