const mongoose = require('mongoose');

/**
 * Work Order Schema
 */
const workOrderSchema = new mongoose.Schema({
    // Priority & Identification
    priorityColor: { type: String, default: '' },
    priorityName: { type: String, default: '' },
    workOrderNumber: { type: String, default: '' },

    // Customer Info
    customerPO: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerAddress: { type: String, default: '' },

    // Tags & Notes
    tags: { type: String, default: '' },

    // Technician / Scheduling
    techName: { type: String, default: '' },
    promisedAppointment: { type: String, default: '' },
    createdDate: { type: String, default: '' },
    requestedDate: { type: String, default: '' },
    completedDate: { type: String, default: '' },

    // Task Info
    task: { type: String, default: '' },
    taskDuration: { type: String, default: '' },

    // Purchase Info
    purchaseStatus: { type: String, default: '' },
    purchaseStatusName: { type: String, default: '' },

    // Assignment Flags
    serial: { type: Number, default: 0 },
    assigned: { type: Boolean, default: false },
    dispatched: { type: Boolean, default: false },
    scheduled: { type: Boolean, default: false },
    scheduledDate: { type: String, default: '' },

    // Locate Call Tracking
    locatesCalled: {
        type: Boolean,
        default: false,
        description: 'Indicates if utility locates have been called'
    },

    callType: {
        type: String,
        enum: ['STANDARD', 'EMERGENCY', null],
        default: null,
        description: 'Type of locate call'
    },

    calledAt: {
        type: Date,
        default: null
    },

    calledBy: {
        type: String,
        default: ''
    },

    calledByEmail: {
        type: String,
        default: ''
    },

    // Timer & Completion
    completionDate: {
        type: Date,
        default: null
    },

    timerStarted: {
        type: Boolean,
        default: false
    },

    timerExpired: {
        type: Boolean,
        default: false
    },

    timeRemaining: {
        type: String,
        default: ''
    },

    // Manual Tagging (Locates Needed)
    manuallyTagged: {
        type: Boolean,
        default: false
    },

    taggedBy: {
        type: String,
        default: ''
    },

    taggedByEmail: {
        type: String,
        default: ''
    },

    taggedAt: {
        type: Date,
        default: null
    },

    // Workflow Status
    workflowStatus: {
        type: String,
        enum: ['CALL_NEEDED', 'IN_PROGRESS', 'COMPLETE', 'UNKNOWN'],
        default: 'UNKNOWN'
    },

    // Classification
    type: {
        type: String,
        enum: ['STANDARD', 'EMERGENCY', 'EXCAVATOR'],
        default: 'STANDARD'
    },

    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }

}, { _id: true });


/**
 * Dashboard Schema
 */
const dashboardDataSchema = new mongoose.Schema(
    {
        filterStartDate: { type: String },
        filterEndDate: { type: String },

        workOrders: [workOrderSchema],

        totalWorkOrders: {
            type: Number,
            default: 0
        },

        source: {
            type: String,
            default: 'external-dashboard'
        },

        scrapedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('Locates', dashboardDataSchema);
