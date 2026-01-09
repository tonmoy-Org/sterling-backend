const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({
    priorityColor: { type: String, default: '' },
    priorityName: { type: String, default: '' },
    workOrderNumber: { type: String },
    customerPO: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    tags: { type: String, default: '' },
    techName: { type: String, default: '' },
    technician: { type: String, default: '' }, // Added for consistency
    promisedAppointment: { type: String, default: '' },
    createdDate: { type: String, default: '' },
    requestedDate: { type: String, default: '' }, // Added alias for createdDate
    completedDate: { type: String, default: '' },
    task: { type: String, default: '' }, // Added for description/task
    taskDuration: { type: String, default: '' },
    purchaseStatus: { type: String, default: '' },
    purchaseStatusName: { type: String, default: '' },

    // ---- NEW ADDED FIELDS ----
    serial: { type: Number, default: 0 },
    assigned: { type: Boolean, default: false },
    dispatched: { type: Boolean, default: false },
    scheduled: { type: Boolean, default: false },
    scheduledDate: { type: String, default: '' },
    
    // ---- EXCAVATOR LOCATE CALL TRACKING FIELDS ----
    locatesCalled: { 
        type: Boolean, 
        default: false,
        description: 'Indicates if utility locates have been called in'
    },
    callType: { 
        type: String, 
        enum: ['STANDARD', 'EMERGENCY', null],
        default: null,
        description: 'Type of locate call made (Standard or Emergency)'
    },
    calledAt: { 
        type: Date, 
        default: null,
        description: 'Timestamp when locates were called'
    },
    calledBy: { 
        type: String, 
        default: '',
        description: 'Name of person who made the call'
    },
    
    // ---- THREE-STAGE WORKFLOW FIELDS ----
    completionDate: {
        type: Date,
        default: null,
        description: 'Date/Time when timer expires (for in-progress)'
    },
    manuallyTagged: {
        type: Boolean,
        default: false,
        description: 'Indicates if this was manually tagged as locates needed'
    },
    taggedBy: {
        type: String,
        default: '',
        description: 'Name of person who manually tagged this locate'
    },
    taggedAt: {
        type: Date,
        default: null,
        description: 'Timestamp when manually tagged'
    },
    timerStarted: {
        type: Boolean,
        default: false,
        description: 'Indicates if timer has been started'
    },
    timerExpired: {
        type: Boolean,
        default: false,
        description: 'Indicates if timer has expired (auto-set)'
    },
    timeRemaining: {
        type: String,
        default: '',
        description: 'Calculated time remaining (for display)'
    },
    
    // Workflow status tracking
    workflowStatus: {
        type: String,
        enum: ['CALL_NEEDED', 'IN_PROGRESS', 'COMPLETE', 'UNKNOWN'],
        default: 'UNKNOWN',
        description: 'Current status in the three-stage workflow'
    },
    
    // Metadata for tracking
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        description: 'Additional metadata for the work order'
    },
    
    // For backward compatibility and type identification
    type: {
        type: String,
        default: 'STANDARD',
        enum: ['STANDARD', 'EMERGENCY', 'EXCAVATOR'],
        description: 'Work order type classification'
    }
});

const dashboardDataSchema = new mongoose.Schema(
    {
        filterStartDate: { type: String },
        filterEndDate: { type: String },
        dispatchDate: { type: String, default: '' },
        workOrders: [workOrderSchema],
        totalWorkOrders: { type: Number, default: 0 },
        source: { type: String, default: 'external-dashboard' },
        scrapedAt: { type: Date, default: Date.now },
        
        // Additional metadata for the entire dashboard
        dashboardMetadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
            description: 'Metadata for the dashboard data collection'
        }
    },
    { timestamps: true }
);

// Indexes for better query performance
dashboardDataSchema.index({ createdAt: -1 });
dashboardDataSchema.index({ 'workOrders.priorityName': 1 });
dashboardDataSchema.index({ 'workOrders.locatesCalled': 1 });
dashboardDataSchema.index({ 'workOrders.callType': 1 });
dashboardDataSchema.index({ 'workOrders.completedDate': -1 });
dashboardDataSchema.index({ 'workOrders.workflowStatus': 1 });
dashboardDataSchema.index({ 'workOrders.completionDate': 1 });
dashboardDataSchema.index({ 'workOrders.timerExpired': 1 });
dashboardDataSchema.index({ 'workOrders.manuallyTagged': 1 });

// Compound indexes for better querying
dashboardDataSchema.index({ 
    'workOrders.priorityName': 1, 
    'workOrders.locatesCalled': 1,
    'workOrders.workflowStatus': 1
});

dashboardDataSchema.index({ 
    'workOrders.manuallyTagged': 1,
    'workOrders.locatesCalled': 1,
    'workOrders.workflowStatus': 1
});

dashboardDataSchema.index({ 
    'workOrders.completionDate': 1,
    'workOrders.timerExpired': 1
});

// Pre-save middleware to ensure data consistency
workOrderSchema.pre('save', function(next) {
    // Auto-set type based on priorityName for excavator locates
    if (this.priorityName && this.priorityName.toUpperCase() === 'EXCAVATOR') {
        this.type = 'EXCAVATOR';
    }
    
    // Auto-set requestedDate from createdDate if not set
    if (this.createdDate && !this.requestedDate) {
        this.requestedDate = this.createdDate;
    }
    
    // Auto-set locatesCalled to false for new excavator locates
    if (this.priorityName && 
        this.priorityName.toUpperCase() === 'EXCAVATOR' && 
        !this.locatesCalled) {
        this.locatesCalled = false;
    }
    
    // Auto-set calledAt when locatesCalled becomes true
    if (this.isModified('locatesCalled') && this.locatesCalled && !this.calledAt) {
        this.calledAt = new Date();
    }
    
    // Auto-set taggedAt when manuallyTagged becomes true
    if (this.isModified('manuallyTagged') && this.manuallyTagged && !this.taggedAt) {
        this.taggedAt = new Date();
    }
    
    // Calculate completion date based on call type
    if (this.isModified('callType') && this.callType && this.calledAt) {
        const calledAt = new Date(this.calledAt);
        let completionDate;
        
        if (this.callType === 'EMERGENCY') {
            // Emergency: 4 hours from called time
            completionDate = new Date(calledAt.getTime() + (4 * 60 * 60 * 1000));
        } else {
            // Standard: 2 business days from called time
            completionDate = new Date(calledAt);
            let businessDays = 2;
            while (businessDays > 0) {
                completionDate.setDate(completionDate.getDate() + 1);
                // Skip weekends (0 = Sunday, 6 = Saturday)
                if (completionDate.getDay() !== 0 && completionDate.getDay() !== 6) {
                    businessDays--;
                }
            }
        }
        
        this.completionDate = completionDate;
        this.timerStarted = true;
        this.timerExpired = false;
    }
    
    // Update timerExpired status if completionDate has passed
    if (this.completionDate) {
        const now = new Date();
        const completionDate = new Date(this.completionDate);
        this.timerExpired = completionDate <= now;
    }
    
    // Update workflow status
    this.updateWorkflowStatus();
    
    // Calculate time remaining for display
    if (this.completionDate && !this.timerExpired) {
        const now = new Date();
        const completionDate = new Date(this.completionDate);
        const timeRemainingMs = completionDate - now;
        
        if (this.callType === 'EMERGENCY') {
            const hours = Math.floor(timeRemainingMs / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));
            this.timeRemaining = `${hours}h ${minutes}m`;
        } else {
            const days = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24));
            this.timeRemaining = `${days} business day${days !== 1 ? 's' : ''}`;
        }
    } else if (this.timerExpired) {
        this.timeRemaining = 'Expired';
    } else {
        this.timeRemaining = '';
    }
    
    next();
});

// Method to update workflow status
workOrderSchema.methods.updateWorkflowStatus = function() {
    // Determine status based on conditions
    if (this.manuallyTagged || 
        (this.priorityName && 
         this.priorityName.toUpperCase() === 'EXCAVATOR' &&
         !this.locatesCalled)) {
        this.workflowStatus = 'CALL_NEEDED';
    } else if (this.locatesCalled && 
               this.timerStarted && 
               !this.timerExpired) {
        this.workflowStatus = 'IN_PROGRESS';
    } else if (this.locatesCalled && 
               this.timerExpired) {
        this.workflowStatus = 'COMPLETE';
    } else {
        this.workflowStatus = 'UNKNOWN';
    }
    
    return this.workflowStatus;
};

// Instance method to check if this is an excavator locate needing a call
workOrderSchema.methods.needsCall = function() {
    return (this.priorityName && 
            this.priorityName.toUpperCase() === 'EXCAVATOR' && 
            !this.locatesCalled) || 
           (this.manuallyTagged && !this.locatesCalled);
};

// Instance method to update call status
workOrderSchema.methods.updateCallStatus = function(callType, calledBy = '') {
    this.locatesCalled = true;
    this.callType = callType.toUpperCase();
    this.calledAt = new Date();
    
    if (calledBy) {
        this.calledBy = calledBy;
    }
    
    // Calculate completion date
    let completionDate;
    if (callType.toUpperCase() === 'EMERGENCY') {
        completionDate = new Date(this.calledAt.getTime() + (4 * 60 * 60 * 1000));
    } else {
        completionDate = new Date(this.calledAt);
        let businessDays = 2;
        while (businessDays > 0) {
            completionDate.setDate(completionDate.getDate() + 1);
            if (completionDate.getDay() !== 0 && completionDate.getDay() !== 6) {
                businessDays--;
            }
        }
    }
    
    this.completionDate = completionDate;
    this.timerStarted = true;
    this.timerExpired = false;
    
    // Update workflow status
    this.updateWorkflowStatus();
    
    // Update metadata
    if (!this.metadata) {
        this.metadata = {};
    }
    this.metadata.lastCallStatusUpdate = new Date();
    this.metadata.updatedBy = calledBy || 'system';
    
    return this;
};

// Instance method to manually tag as locates needed
workOrderSchema.methods.tagAsLocatesNeeded = function(taggedBy = '', notes = '') {
    this.manuallyTagged = true;
    this.taggedBy = taggedBy;
    this.taggedAt = new Date();
    this.priorityName = 'EXCAVATOR';
    this.priorityColor = '#f97316'; // Orange color
    
    // Update workflow status
    this.updateWorkflowStatus();
    
    // Update metadata
    if (!this.metadata) {
        this.metadata = {};
    }
    this.metadata.taggedAsLocatesNeeded = true;
    this.metadata.taggedAt = this.taggedAt;
    this.metadata.taggedBy = taggedBy;
    this.metadata.notes = notes || '';
    
    return this;
};

// Instance method to check if timer has expired
workOrderSchema.methods.isTimerExpired = function() {
    if (!this.completionDate) return false;
    
    const now = new Date();
    const completionDate = new Date(this.completionDate);
    return completionDate <= now;
};

// Instance method to get time remaining
workOrderSchema.methods.getTimeRemaining = function() {
    if (!this.completionDate || this.timerExpired) {
        return { expired: true, text: 'Expired' };
    }
    
    const now = new Date();
    const completionDate = new Date(this.completionDate);
    const timeRemainingMs = completionDate - now;
    
    if (timeRemainingMs <= 0) {
        return { expired: true, text: 'Expired' };
    }
    
    if (this.callType === 'EMERGENCY') {
        const hours = Math.floor(timeRemainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));
        return { 
            expired: false, 
            text: `${hours}h ${minutes}m remaining`,
            hours,
            minutes,
            totalMinutes: Math.floor(timeRemainingMs / (1000 * 60))
        };
    } else {
        const days = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24));
        return { 
            expired: false, 
            text: `${days} business day${days !== 1 ? 's' : ''} remaining`,
            days
        };
    }
};

// Static method to find excavator locates needing calls
workOrderSchema.statics.findExcavatorNeedingCalls = function() {
    return this.find({
        $or: [
            { 
                'workOrders.priorityName': { $regex: 'excavator', $options: 'i' },
                'workOrders.locatesCalled': false
            },
            {
                'workOrders.manuallyTagged': true,
                'workOrders.locatesCalled': false
            }
        ]
    });
};

// Static method to find in-progress locates
workOrderSchema.statics.findInProgressLocates = function() {
    const now = new Date();
    return this.find({
        'workOrders.locatesCalled': true,
        'workOrders.completionDate': { $gt: now },
        'workOrders.timerExpired': false
    });
};

// Static method to find completed locates (timer expired)
workOrderSchema.statics.findCompletedLocates = function() {
    const now = new Date();
    return this.find({
        'workOrders.locatesCalled': true,
        'workOrders.completionDate': { $lte: now },
        'workOrders.timerExpired': true
    });
};

// Static method to cleanup expired locates
workOrderSchema.statics.cleanupExpiredLocates = async function() {
    const now = new Date();
    
    // Find work orders that should be expired
    const dashboards = await this.find({
        'workOrders.locatesCalled': true,
        'workOrders.completionDate': { $lte: now },
        'workOrders.timerExpired': false
    });
    
    let updatedCount = 0;
    
    for (const dashboard of dashboards) {
        let hasChanges = false;
        
        for (const workOrder of dashboard.workOrders) {
            if (workOrder.locatesCalled && 
                workOrder.completionDate && 
                !workOrder.timerExpired) {
                
                const completionDate = new Date(workOrder.completionDate);
                if (completionDate <= now) {
                    workOrder.timerExpired = true;
                    workOrder.workflowStatus = 'COMPLETE';
                    
                    if (!workOrder.metadata) workOrder.metadata = {};
                    workOrder.metadata.expiredAt = now;
                    workOrder.metadata.autoMovedToComplete = true;
                    
                    hasChanges = true;
                    updatedCount++;
                }
            }
        }
        
        if (hasChanges) {
            await dashboard.save();
        }
    }
    
    return updatedCount;
};

module.exports = mongoose.model('Locates', dashboardDataSchema);