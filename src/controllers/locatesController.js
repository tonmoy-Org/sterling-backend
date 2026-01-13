const { scrapeLocatesDispatchBoard } = require('../service/dashboardLocatesScraper.service');
const DashboardData = require('../models/Locates');
const { assignedLocatesDispatchBoard } = require('../service/assignedLocatesScraper.service');

const getAllDashboardData = async (req, res) => {
    try {
        const data = await DashboardData.find().sort({ createdAt: -1 });

        res.json({
            success: true,
            total: data.length,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const syncDashboard = async (req, res) => {
    try {
        let data = await scrapeLocatesDispatchBoard();

        // Filter only EXCAVATOR
        let filtered = data.workOrders.filter(w => w.priorityName === "EXCAVATOR");

        // Deduplicate by workOrderNumber
        let unique = [];
        let seen = new Set();

        for (let w of filtered) {
            if (!seen.has(w.workOrderNumber)) {
                seen.add(w.workOrderNumber);
                unique.push(w);
            }
        }

        data.workOrders = unique;

        const saved = await DashboardData.create(data);

        res.json({
            success: true,
            message: "Dashboard synced successfully",
            data: saved
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const syncAssignedDashboard = async (req, res) => {
    try {
        let data = await assignedLocatesDispatchBoard();

        if (Array.isArray(data?.workOrders)) {
            let filtered = data.workOrders.filter(w => w.priorityName === "EXCAVATOR");

            const seen = new Set();
            const unique = [];

            for (const w of filtered) {
                if (!seen.has(w.workOrderNumber)) {
                    seen.add(w.workOrderNumber);
                    unique.push(w);
                }
            }

            data.workOrders = unique;
            data.totalWorkOrders = unique.length;
        }

        const saved = await DashboardData.create(data);

        res.json({
            success: true,
            message: "Dashboard synced successfully",
            data: saved
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const deleteWorkOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const dashboard = await DashboardData.findOne({
            "workOrders._id": id
        });

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: "Work order not found"
            });
        }

        const workOrderIndex = dashboard.workOrders.findIndex(
            wo => wo._id.toString() === id
        );

        if (workOrderIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Work order not found"
            });
        }

        const workOrderToDelete = dashboard.workOrders[workOrderIndex];

        if (!dashboard.deletedWorkOrders) {
            dashboard.deletedWorkOrders = [];
        }

        dashboard.deletedWorkOrders.push({
            ...workOrderToDelete.toObject(),
            deletedAt: new Date(),
            deletedBy: req.user?.name || 'Unknown User',
            deletedByEmail: req.user?.email || 'unknown@email.com',
            deletedFrom: 'Dashboard',
            isPermanentlyDeleted: false,
            originalWorkOrderId: workOrderToDelete._id
        });

        dashboard.workOrders.splice(workOrderIndex, 1);
        dashboard.totalWorkOrders = dashboard.workOrders.length;

        await dashboard.save();

        res.json({
            success: true,
            message: "Work order moved to recycle bin successfully",
            data: {
                dashboard: dashboard,
                deletedWorkOrder: workOrderToDelete
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const bulkDeleteWorkOrders = async (req, res) => {
    const { ids } = req.body;

    try {
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of work order IDs"
            });
        }

        const dashboards = await DashboardData.find({
            "workOrders._id": { $in: ids }
        });

        if (dashboards.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No matching work orders found"
            });
        }

        let deletedCount = 0;

        for (const dashboard of dashboards) {
            if (!dashboard.deletedWorkOrders) {
                dashboard.deletedWorkOrders = [];
            }

            const workOrdersToDelete = dashboard.workOrders.filter(
                workOrder => ids.includes(workOrder._id.toString())
            );

            workOrdersToDelete.forEach(workOrder => {
                dashboard.deletedWorkOrders.push({
                    ...workOrder.toObject(),
                    deletedAt: new Date(),
                    deletedBy: req.user?.name || 'Unknown User',
                    deletedByEmail: req.user?.email || 'unknown@email.com',
                    deletedFrom: 'Dashboard',
                    isPermanentlyDeleted: false,
                    originalWorkOrderId: workOrder._id
                });
                deletedCount++;
            });

            dashboard.workOrders = dashboard.workOrders.filter(
                workOrder => !ids.includes(workOrder._id.toString())
            );
            dashboard.totalWorkOrders = dashboard.workOrders.length;

            await dashboard.save();
        }

        res.json({
            success: true,
            message: `${deletedCount} work order(s) moved to recycle bin successfully`,
            deletedCount: deletedCount
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Server error during bulk delete'
        });
    }
};

const updateWorkOrderCallStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { locatesCalled, callType, calledAt } = req.body;

        const calledByName = req.user?.name || req.body.calledBy || 'Unknown Manager';
        const calledByEmail = req.user?.email || req.body.calledByEmail || 'unknown@email.com';

        if (typeof locatesCalled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: "locatesCalled must be a boolean"
            });
        }

        if (callType && !['STANDARD', 'EMERGENCY'].includes(callType.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: "callType must be either 'STANDARD' or 'EMERGENCY'"
            });
        }

        const dashboard = await DashboardData.findOne({
            "workOrders._id": id
        });

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: "Work order not found"
            });
        }

        const workOrderIndex = dashboard.workOrders.findIndex(
            workOrder => workOrder._id.toString() === id
        );

        if (workOrderIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Work order not found in dashboard"
            });
        }

        const workOrder = dashboard.workOrders[workOrderIndex];

        workOrder.locatesCalled = locatesCalled;

        if (callType) {
            workOrder.callType = callType.toUpperCase();
            workOrder.type = callType.toUpperCase();
        }

        workOrder.calledBy = calledByName;
        workOrder.calledByEmail = calledByEmail;

        const calledAtDate = calledAt ? new Date(calledAt) : new Date();
        workOrder.calledAt = calledAtDate;

        if (callType?.toUpperCase() === 'EMERGENCY') {
            workOrder.completionDate = new Date(calledAtDate.getTime() + (4 * 60 * 60 * 1000));
        } else {
            const completionDate = new Date(calledAtDate);
            let businessDays = 2;

            while (businessDays > 0) {
                completionDate.setDate(completionDate.getDate() + 1);

                if (completionDate.getDay() !== 0 && completionDate.getDay() !== 6) {
                    businessDays--;
                }
            }

            workOrder.completionDate = completionDate;
        }

        workOrder.workflowStatus = 'IN_PROGRESS';
        workOrder.timerStarted = true;
        workOrder.timerExpired = false;

        if (!workOrder.metadata) {
            workOrder.metadata = {};
        }

        workOrder.metadata.lastCallStatusUpdate = new Date();
        workOrder.metadata.updatedBy = calledByName;
        workOrder.metadata.updatedByEmail = calledByEmail;
        workOrder.metadata.updatedAt = new Date();

        await dashboard.save();

        res.json({
            success: true,
            message: `Work order call status updated successfully`,
            data: {
                workOrder: workOrder,
                updates: {
                    locatesCalled,
                    callType: callType?.toUpperCase(),
                    calledAt: workOrder.calledAt,
                    calledBy: workOrder.calledBy,
                    calledByEmail: workOrder.calledByEmail,
                    completionDate: workOrder.completionDate,
                    workflowStatus: workOrder.workflowStatus
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Server error updating call status'
        });
    }
};

const checkAndUpdateExpiredTimers = async (req, res) => {
    try {
        const now = new Date();

        const dashboards = await DashboardData.find({
            "workOrders.locatesCalled": true,
            "workOrders.timerExpired": false,
            "workOrders.completionDate": { $lt: now }
        });

        let expiredCount = 0;

        for (const dashboard of dashboards) {
            let needsSave = false;

            for (const workOrder of dashboard.workOrders) {
                if (workOrder.locatesCalled &&
                    !workOrder.timerExpired &&
                    workOrder.completionDate &&
                    workOrder.completionDate < now) {

                    workOrder.timerExpired = true;
                    workOrder.workflowStatus = 'COMPLETE';

                    if (!workOrder.metadata) {
                        workOrder.metadata = {};
                    }
                    workOrder.metadata.timerExpiredAt = now;
                    workOrder.metadata.autoUpdatedAt = now;

                    needsSave = true;
                    expiredCount++;
                }
            }

            if (needsSave) {
                await dashboard.save();
            }
        }

        res.json({
            success: true,
            message: `Updated ${expiredCount} expired work orders`,
            expiredCount
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Server error checking expired timers'
        });
    }
};

const getWorkOrderByNumber = async (req, res) => {
    try {
        const { workOrderNumber } = req.params;

        const dashboard = await DashboardData.findOne({
            "workOrders.workOrderNumber": workOrderNumber.toString()
        });

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: `Work order ${workOrderNumber} not found`
            });
        }

        const workOrder = dashboard.workOrders.find(
            wo => wo.workOrderNumber.toString() === workOrderNumber.toString()
        );

        if (!workOrder) {
            return res.status(404).json({
                success: false,
                message: "Work order not found in dashboard"
            });
        }

        res.json({
            success: true,
            data: workOrder
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Server error getting work order'
        });
    }
};

const completeWorkOrderManually = async (req, res) => {
    try {
        const { id } = req.params;

        const dashboard = await DashboardData.findOne({
            "workOrders._id": id
        });

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: "Work order not found"
            });
        }

        const workOrder = dashboard.workOrders.find(
            wo => wo._id.toString() === id
        );

        if (!workOrder) {
            return res.status(404).json({
                success: false,
                message: "Work order not found in dashboard"
            });
        }

        if (workOrder.workflowStatus === 'COMPLETE') {
            return res.status(400).json({
                success: false,
                message: "Work order is already completed"
            });
        }

        workOrder.workflowStatus = 'COMPLETE';
        workOrder.timerExpired = false;
        workOrder.timerStarted = false;

        if (!workOrder.metadata) {
            workOrder.metadata = {};
        }

        workOrder.metadata.completedManually = true;
        workOrder.metadata.completedAt = new Date();
        workOrder.metadata.completedBy = req.user?.name || 'Unknown User';
        workOrder.metadata.completedByEmail = req.user?.email || 'unknown@email.com';

        workOrder.completionDate = new Date();

        await dashboard.save();

        res.json({
            success: true,
            message: "Work order marked as COMPLETE successfully",
            data: workOrder
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Server error completing work order'
        });
    }
};

const getDeletedHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const dashboards = await DashboardData.find({
            "deletedWorkOrders.0": { $exists: true }
        });

        let allDeletedWorkOrders = [];

        dashboards.forEach(dashboard => {
            if (dashboard.deletedWorkOrders && dashboard.deletedWorkOrders.length > 0) {
                dashboard.deletedWorkOrders.forEach(deletedOrder => {
                    if (!deletedOrder.isPermanentlyDeleted) {
                        allDeletedWorkOrders.push({
                            ...deletedOrder,
                            dashboardId: dashboard._id,
                            dashboardName: dashboard.name || `Dashboard ${dashboard._id}`,
                            dashboardCreatedAt: dashboard.createdAt,
                            _id: deletedOrder._id || deletedOrder.originalWorkOrderId
                        });
                    }
                });
            }
        });

        if (search) {
            const searchLower = search.toLowerCase();
            allDeletedWorkOrders = allDeletedWorkOrders.filter(item =>
                item.workOrderNumber?.toLowerCase().includes(searchLower) ||
                item.customerName?.toLowerCase().includes(searchLower) ||
                item.customerAddress?.toLowerCase().includes(searchLower) ||
                item.deletedBy?.toLowerCase().includes(searchLower)
            );
        }

        allDeletedWorkOrders.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

        const total = allDeletedWorkOrders.length;
        const paginatedData = allDeletedWorkOrders.slice(skip, skip + parseInt(limit));

        res.json({
            success: true,
            data: paginatedData,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalRecords: total,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const getDashboardWithHistory = async (req, res) => {
    try {
        const { id } = req.params;

        const dashboard = await DashboardData.findById(id);

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: "Dashboard not found"
            });
        }

        res.json({
            success: true,
            data: {
                dashboard: dashboard,
                activeWorkOrders: dashboard.workOrders || [],
                deletedWorkOrders: dashboard.deletedWorkOrders?.filter(order => !order.isPermanentlyDeleted) || [],
                permanentlyDeletedWorkOrders: dashboard.deletedWorkOrders?.filter(order => order.isPermanentlyDeleted) || []
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const restoreWorkOrder = async (req, res) => {
    try {
        const { dashboardId, deletedOrderId } = req.params;

        const dashboard = await DashboardData.findById(dashboardId);

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: "Dashboard not found"
            });
        }

        if (!dashboard.deletedWorkOrders || dashboard.deletedWorkOrders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No deleted work orders found"
            });
        }

        const deletedOrderIndex = dashboard.deletedWorkOrders.findIndex(
            order => (order._id?.toString() === deletedOrderId ||
                order.originalWorkOrderId?.toString() === deletedOrderId)
                && !order.isPermanentlyDeleted
        );

        if (deletedOrderIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Deleted work order not found or already permanently deleted"
            });
        }

        const workOrderToRestore = dashboard.deletedWorkOrders[deletedOrderIndex];

        const restoredWorkOrder = {
            priorityColor: workOrderToRestore.priorityColor || '',
            priorityName: workOrderToRestore.priorityName || '',
            workOrderNumber: workOrderToRestore.workOrderNumber || '',
            customerPO: workOrderToRestore.customerPO || '',
            customerName: workOrderToRestore.customerName || '',
            customerAddress: workOrderToRestore.customerAddress || '',
            tags: workOrderToRestore.tags || '',
            techName: workOrderToRestore.techName || '',
            promisedAppointment: workOrderToRestore.promisedAppointment || '',
            createdDate: workOrderToRestore.createdDate || '',
            requestedDate: workOrderToRestore.requestedDate || '',
            completedDate: workOrderToRestore.completedDate || '',
            task: workOrderToRestore.task || '',
            taskDuration: workOrderToRestore.taskDuration || '',
            purchaseStatus: workOrderToRestore.purchaseStatus || '',
            purchaseStatusName: workOrderToRestore.purchaseStatusName || '',
            serial: workOrderToRestore.serial || 0,
            assigned: workOrderToRestore.assigned || false,
            dispatched: workOrderToRestore.dispatched || false,
            scheduled: workOrderToRestore.scheduled || false,
            scheduledDate: workOrderToRestore.scheduledDate || '',
            locatesCalled: workOrderToRestore.locatesCalled || false,
            callType: workOrderToRestore.callType || null,
            calledAt: workOrderToRestore.calledAt || null,
            calledBy: workOrderToRestore.calledBy || '',
            calledByEmail: workOrderToRestore.calledByEmail || '',
            completionDate: workOrderToRestore.completionDate || null,
            timerStarted: workOrderToRestore.timerStarted || false,
            timerExpired: workOrderToRestore.timerExpired || false,
            timeRemaining: workOrderToRestore.timeRemaining || '',
            workflowStatus: workOrderToRestore.workflowStatus || 'UNKNOWN',
            type: workOrderToRestore.type || 'STANDARD',
            _id: workOrderToRestore.originalWorkOrderId || workOrderToRestore._id,
            metadata: {
                ...workOrderToRestore.metadata,
                restored: true,
                restoredAt: new Date(),
                restoredBy: req.user?.name || 'Unknown User',
                restoredByEmail: req.user?.email || 'unknown@email.com'
            }
        };

        dashboard.workOrders.push(restoredWorkOrder);
        dashboard.totalWorkOrders = dashboard.workOrders.length;

        dashboard.deletedWorkOrders.splice(deletedOrderIndex, 1);

        await dashboard.save();

        res.json({
            success: true,
            message: "Work order restored successfully",
            data: {
                dashboard: dashboard,
                restoredWorkOrder: restoredWorkOrder
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const permanentlyDeleteFromHistory = async (req, res) => {
    try {
        const { dashboardId, deletedOrderId } = req.params;

        const dashboard = await DashboardData.findById(dashboardId);

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: "Dashboard not found"
            });
        }

        if (!dashboard.deletedWorkOrders || dashboard.deletedWorkOrders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No deleted work orders found"
            });
        }

        const deletedOrderIndex = dashboard.deletedWorkOrders.findIndex(
            order => order._id.toString() === deletedOrderId ||
                order.originalWorkOrderId?.toString() === deletedOrderId
        );

        if (deletedOrderIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Deleted work order not found"
            });
        }

        const permanentlyDeletedItem = dashboard.deletedWorkOrders.splice(deletedOrderIndex, 1)[0];

        await dashboard.save();

        res.json({
            success: true,
            message: "Work order permanently deleted from database",
            data: permanentlyDeletedItem
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const bulkPermanentlyDelete = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of deleted work order IDs"
            });
        }

        let permanentlyDeletedCount = 0;
        const deletedItems = [];

        const dashboards = await DashboardData.find({
            "deletedWorkOrders._id": { $in: ids }
        });

        if (dashboards.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No matching deleted work orders found"
            });
        }

        for (const dashboard of dashboards) {
            if (!dashboard.deletedWorkOrders || dashboard.deletedWorkOrders.length === 0) {
                continue;
            }

            const originalLength = dashboard.deletedWorkOrders.length;

            dashboard.deletedWorkOrders = dashboard.deletedWorkOrders.filter(order => {
                if (ids.includes(order._id.toString()) ||
                    (order.originalWorkOrderId && ids.includes(order.originalWorkOrderId.toString()))) {
                    permanentlyDeletedCount++;
                    deletedItems.push({
                        ...order.toObject(),
                        dashboardId: dashboard._id,
                        dashboardName: dashboard.name || `Dashboard ${dashboard._id}`
                    });
                    return false;
                }
                return true;
            });

            if (originalLength !== dashboard.deletedWorkOrders.length) {
                await dashboard.save();
            }
        }

        res.json({
            success: true,
            message: `${permanentlyDeletedCount} record(s) permanently deleted from database`,
            deletedCount: permanentlyDeletedCount,
            deletedItems: deletedItems.slice(0, 10)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const clearAllHistory = async (req, res) => {
    try {
        const dashboards = await DashboardData.find({
            "deletedWorkOrders.0": { $exists: true }
        });

        let clearedCount = 0;

        for (const dashboard of dashboards) {
            if (dashboard.deletedWorkOrders && dashboard.deletedWorkOrders.length > 0) {
                clearedCount += dashboard.deletedWorkOrders.length;

                dashboard.deletedWorkOrders = [];

                await dashboard.save();
            }
        }

        res.json({
            success: true,
            message: `${clearedCount} history records permanently deleted from database`,
            clearedCount
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    syncDashboard,
    syncAssignedDashboard,
    getAllDashboardData,
    deleteWorkOrder,
    bulkDeleteWorkOrders,
    checkAndUpdateExpiredTimers,
    getWorkOrderByNumber,
    updateWorkOrderCallStatus,
    completeWorkOrderManually,
    getDeletedHistory,
    restoreWorkOrder,
    permanentlyDeleteFromHistory,
    bulkPermanentlyDelete,
    clearAllHistory,
    getDashboardWithHistory
};