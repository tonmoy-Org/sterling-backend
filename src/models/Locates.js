const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({
    priorityColor: { type: String, default: '' },
    priorityName: { type: String, default: '' },
    workOrderNumber: { type: String, default: '' },
    customerPO: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    tags: { type: String, default: '' },
    techName: { type: String, default: '' },
    createdDate: { type: String, default: '' },
    requestedDate: { type: String, default: '' },
    completedDate: { type: String, default: '' },
    task: { type: String, default: '' },
    serial: { type: Number, default: 0 },
    scheduledDate: { type: String, default: '' },
    locatesCalled: { type: Boolean, default: false },
    callType: { type: String, enum: ['STANDARD', 'EMERGENCY', null], default: null },
    calledAt: { type: Date, default: null },
    calledBy: { type: String, default: '' },
    calledByEmail: { type: String, default: '' },
    completionDate: { type: Date, default: null },
    timerStarted: { type: Boolean, default: false },
    timerExpired: { type: Boolean, default: false },
    timeRemaining: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: true });

const deletedWorkOrderSchema = new mongoose.Schema({
    priorityColor: { type: String, default: '' },
    priorityName: { type: String, default: '' },
    workOrderNumber: { type: String, default: '' },
    customerPO: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    tags: { type: String, default: '' },
    techName: { type: String, default: '' },
    createdDate: { type: String, default: '' },
    requestedDate: { type: String, default: '' },
    completedDate: { type: String, default: '' },
    task: { type: String, default: '' },
    serial: { type: Number, default: 0 },
    scheduledDate: { type: String, default: '' },
    locatesCalled: { type: Boolean, default: false },
    callType: { type: String, enum: ['STANDARD', 'EMERGENCY', null], default: null },
    calledAt: { type: Date, default: null },
    calledBy: { type: String, default: '' },
    calledByEmail: { type: String, default: '' },
    completionDate: { type: Date, default: null },
    timerStarted: { type: Boolean, default: false },
    timerExpired: { type: Boolean, default: false },
    timeRemaining: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: Date.now },
    deletedBy: { type: String, default: '' },
    deletedByEmail: { type: String, default: '' },
    deletedFrom: { type: String, enum: ['Dashboard', 'AssignedDashboard', 'Unknown'], default: 'Unknown' },
    originalDashboardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Locates' },
    originalWorkOrderId: { type: mongoose.Schema.Types.ObjectId },
    isPermanentlyDeleted: { type: Boolean, default: false },
    permanentlyDeletedAt: { type: Date, default: null },
    restored: { type: Boolean, default: false },
    restoredAt: { type: Date, default: null },
    restoredBy: { type: String, default: '' },
    restoredByEmail: { type: String, default: '' }
}, { timestamps: true });

const dashboardDataSchema = new mongoose.Schema({
    filterStartDate: String,
    filterEndDate: String,
    workOrders: [workOrderSchema],
    deletedWorkOrders: [deletedWorkOrderSchema],
    totalWorkOrders: { type: Number, default: 0 },
    totalDeletedWorkOrders: { type: Number, default: 0 },
    totalActiveDeletedWorkOrders: { type: Number, default: 0 },
    totalPermanentlyDeletedWorkOrders: { type: Number, default: 0 },
    scrapedAt: { type: Date, default: Date.now },
    dashboardMetadata: {
        lastSyncDate: { type: Date, default: null },
        syncCount: { type: Number, default: 0 },
        lastDeletedCleanup: { type: Date, default: null }
    }
}, { timestamps: true });

dashboardDataSchema.index({ 'workOrders.workOrderNumber': 1 });
dashboardDataSchema.index({ 'deletedWorkOrders.workOrderNumber': 1 });
dashboardDataSchema.index({ 'deletedWorkOrders.deletedAt': -1 });
dashboardDataSchema.index({ 'deletedWorkOrders.isPermanentlyDeleted': 1 });
dashboardDataSchema.index({ 'deletedWorkOrders.restored': 1 });

dashboardDataSchema.pre('save', function (next) {
    this.totalWorkOrders = this.workOrders.length;
    this.totalDeletedWorkOrders = this.deletedWorkOrders.length;
    this.totalActiveDeletedWorkOrders = this.deletedWorkOrders.filter(o => !o.isPermanentlyDeleted && !o.restored).length;
    this.totalPermanentlyDeletedWorkOrders = this.deletedWorkOrders.filter(o => o.isPermanentlyDeleted).length;
    next();
});

dashboardDataSchema.statics.findByWorkOrderNumber = function (workOrderNumber) {
    return this.findOne({
        $or: [
            { 'workOrders.workOrderNumber': workOrderNumber },
            { 'deletedWorkOrders.workOrderNumber': workOrderNumber }
        ]
    });
};

dashboardDataSchema.statics.getAllDeletedWorkOrders = function () {
    return this.aggregate([
        { $unwind: '$deletedWorkOrders' },
        { $match: { 'deletedWorkOrders.isPermanentlyDeleted': false, 'deletedWorkOrders.restored': false } },
        { $sort: { 'deletedWorkOrders.deletedAt': -1 } }
    ]);
};

dashboardDataSchema.virtual('activeDeletedWorkOrders').get(function () {
    return this.deletedWorkOrders.filter(o => !o.isPermanentlyDeleted && !o.restored);
});

dashboardDataSchema.virtual('permanentlyDeletedWorkOrders').get(function () {
    return this.deletedWorkOrders.filter(o => o.isPermanentlyDeleted);
});

module.exports = mongoose.model('Locates', dashboardDataSchema);