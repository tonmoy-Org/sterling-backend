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
        const data = await scrapeLocatesDispatchBoard();
        console.log('Scraped Data:', data);
        const saved = await DashboardData.create(data);

        res.json({
            success: true,
            message: 'Dashboard synced successfully',
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
        const data = await assignedLocatesDispatchBoard();
        console.log('Scraped Data:', data);
        const saved = await DashboardData.create(data);

        res.json({
            success: true,
            message: 'Dashboard synced successfully',
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

        const updated = await DashboardData.findOneAndUpdate(
            { "workOrders._id": id },
            { $pull: { workOrders: { _id: id } } },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Work order not found"
            });
        }

        res.json({
            success: true,
            message: "Work order deleted successfully",
            data: updated
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
    console.log('=== bulkDeleteWorkOrders ===');
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

        const updatePromises = dashboards.map(dashboard => {
            const initialCount = dashboard.workOrders.length;
            dashboard.workOrders = dashboard.workOrders.filter(
                workOrder => !ids.includes(workOrder._id.toString())
            );
            dashboard.totalWorkOrders = dashboard.workOrders.length;
            return dashboard.save();
        });

        await Promise.all(updatePromises);

        res.json({
            success: true,
            message: `${ids.length} work order(s) deleted successfully`,
            deletedCount: ids.length
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

        console.log(`=== updateWorkOrderCallStatus ===`);
        console.log(`User: ${req.user?.name || 'Unknown'}`);
        console.log(`User email: ${req.user?.email || 'No email'}`);
        console.log(`Body:`, req.body);

        // Get manager info from authenticated user
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

        // Find the dashboard containing the work order
        const dashboard = await DashboardData.findOne({
            "workOrders._id": id
        });

        if (!dashboard) {
            console.log(`Work order ${id} not found in any dashboard`);
            return res.status(404).json({
                success: false,
                message: "Work order not found"
            });
        }

        // Find the specific work order
        const workOrderIndex = dashboard.workOrders.findIndex(
            workOrder => workOrder._id.toString() === id
        );

        if (workOrderIndex === -1) {
            console.log(`Work order ${id} not found in dashboard workOrders array`);
            return res.status(404).json({
                success: false,
                message: "Work order not found in dashboard"
            });
        }

        // Get the work order
        const workOrder = dashboard.workOrders[workOrderIndex];
        console.log(`Found work order: ${workOrder.workOrderNumber}`);

        // Update the work order
        workOrder.locatesCalled = locatesCalled;

        if (callType) {
            workOrder.callType = callType.toUpperCase();
            workOrder.type = callType.toUpperCase(); // Also update the type field
        }

        // Set caller information
        workOrder.calledBy = calledByName;
        workOrder.calledByEmail = calledByEmail;

        // Set calledAt time
        const calledAtDate = calledAt ? new Date(calledAt) : new Date();
        workOrder.calledAt = calledAtDate;

        // Calculate completion date based on call type
        if (callType?.toUpperCase() === 'EMERGENCY') {
            // Emergency: 4 hours from called time
            workOrder.completionDate = new Date(calledAtDate.getTime() + (4 * 60 * 60 * 1000));
            console.log(`Emergency locate - Completion in 4 hours`);
        } else {
            // Standard: 2 business days from called time
            const completionDate = new Date(calledAtDate);
            let businessDays = 2;

            while (businessDays > 0) {
                completionDate.setDate(completionDate.getDate() + 1);

                // Skip weekends (0 = Sunday, 6 = Saturday)
                if (completionDate.getDay() !== 0 && completionDate.getDay() !== 6) {
                    businessDays--;
                }
            }

            workOrder.completionDate = completionDate;
            console.log(`Standard locate - Completion in 2 business days: ${completionDate}`);
        }

        // Update workflow status
        workOrder.workflowStatus = 'IN_PROGRESS';
        workOrder.timerStarted = true;
        workOrder.timerExpired = false;

        // Add metadata for tracking
        if (!workOrder.metadata) {
            workOrder.metadata = {};
        }

        workOrder.metadata.lastCallStatusUpdate = new Date();
        workOrder.metadata.updatedBy = calledByName;
        workOrder.metadata.updatedByEmail = calledByEmail;
        workOrder.metadata.updatedAt = new Date();

        // Save the dashboard
        await dashboard.save();
        console.log(`Work order ${workOrder.workOrderNumber} updated successfully`);

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
        console.error('Error updating work order call status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error updating call status'
        });
    }
};

const tagLocatesNeeded = async (req, res) => {
    console.log('=== tagLocatesNeeded ===');
    console.log('Request body:', req.body);

    try {
        const { workOrderNumber, name, email, tags } = req.body;

        // Validate required fields
        if (!workOrderNumber) {
            return res.status(400).json({
                success: false,
                message: "Work order number is required"
            });
        }

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required"
            });
        }

        // Find dashboard containing the work order by workOrderNumber
        const dashboard = await DashboardData.findOne({
            "workOrders.workOrderNumber": workOrderNumber.toString()
        });

        if (!dashboard) {
            console.log(`Work order ${workOrderNumber} not found in database`);
            return res.status(404).json({
                success: false,
                message: `Work order ${workOrderNumber} not found`
            });
        }

        // Find the specific work order
        const workOrderIndex = dashboard.workOrders.findIndex(
            workOrder => workOrder.workOrderNumber.toString() === workOrderNumber.toString()
        );

        if (workOrderIndex === -1) {
            console.log(`Work order ${workOrderNumber} not found in workOrders array`);
            return res.status(404).json({
                success: false,
                message: "Work order not found in dashboard"
            });
        }

        // Update the work order with manual tag
        const workOrder = dashboard.workOrders[workOrderIndex];
        console.log(`Found work order: ${workOrder.workOrderNumber}`);

        // Mark as manually tagged
        workOrder.manuallyTagged = true;
        workOrder.taggedBy = name;
        workOrder.taggedByEmail = email;
        workOrder.taggedAt = new Date();

        // Update priority and type to show it's an excavator locate
        workOrder.priorityName = 'EXCAVATOR';
        workOrder.priorityColor = 'rgb(255, 102, 204)'; // Pink color for excavator priority
        workOrder.type = 'EXCAVATOR'; // Set type to EXCAVATOR
        workOrder.workflowStatus = 'CALL_NEEDED'; // Update workflow status

        // Add or update tags
        if (tags) {
            workOrder.tags = workOrder.tags ?
                `${workOrder.tags}, ${tags}`.replace(/^,\s*/, '') :
                tags;
        } else if (!workOrder.tags || !workOrder.tags.includes('Locates Needed')) {
            workOrder.tags = workOrder.tags ?
                `${workOrder.tags}, Locates Needed` :
                'Locates Needed';
        }

        // Create metadata if not exists
        if (!workOrder.metadata) {
            workOrder.metadata = {};
        }
        workOrder.metadata.manuallyTaggedAt = new Date();
        workOrder.metadata.tagAddedBy = name;
        workOrder.metadata.tagAddedByEmail = email;
        workOrder.metadata.tagUpdatedAt = new Date();

        // Save the updated dashboard
        await dashboard.save();

        console.log(`Successfully tagged work order ${workOrderNumber} as Locates Needed`);

        res.json({
            success: true,
            message: `Work order ${workOrderNumber} tagged as 'Locates Needed' successfully`,
            data: {
                workOrder: workOrder,
                updates: {
                    manuallyTagged: true,
                    taggedBy: name,
                    taggedByEmail: email,
                    priorityName: workOrder.priorityName,
                    type: workOrder.type,
                    tags: workOrder.tags,
                    workflowStatus: workOrder.workflowStatus
                }
            }
        });

    } catch (error) {
        console.error('Error tagging locates needed:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error tagging locates needed'
        });
    }
};

const bulkTagLocatesNeeded = async (req, res) => {
    console.log('=== bulkTagLocatesNeeded ===');
    console.log('Request body:', req.body);

    try {
        const { workOrderNumbers, name, email, tags } = req.body;

        // Validate required fields
        if (!Array.isArray(workOrderNumbers) || workOrderNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Work order numbers array is required"
            });
        }

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required"
            });
        }

        const results = {
            successful: [],
            failed: []
        };

        // Process each work order number
        for (const workOrderNumber of workOrderNumbers) {
            try {
                // Find dashboard containing the work order
                const dashboard = await DashboardData.findOne({
                    "workOrders.workOrderNumber": workOrderNumber.toString()
                });

                if (!dashboard) {
                    results.failed.push({
                        workOrderNumber,
                        reason: `Work order ${workOrderNumber} not found`
                    });
                    continue;
                }

                // Find the specific work order
                const workOrderIndex = dashboard.workOrders.findIndex(
                    workOrder => workOrder.workOrderNumber.toString() === workOrderNumber.toString()
                );

                if (workOrderIndex === -1) {
                    results.failed.push({
                        workOrderNumber,
                        reason: "Work order not found in dashboard"
                    });
                    continue;
                }

                // Update the work order
                const workOrder = dashboard.workOrders[workOrderIndex];

                workOrder.manuallyTagged = true;
                workOrder.taggedBy = name;
                workOrder.taggedByEmail = email;
                workOrder.taggedAt = new Date();

                // Update priority and type
                workOrder.priorityName = 'EXCAVATOR';
                workOrder.priorityColor = 'rgb(255, 102, 204)';
                workOrder.type = 'EXCAVATOR';
                workOrder.workflowStatus = 'CALL_NEEDED';

                if (tags) {
                    workOrder.tags = workOrder.tags ?
                        `${workOrder.tags}, ${tags}`.replace(/^,\s*/, '') :
                        tags;
                } else if (!workOrder.tags || !workOrder.tags.includes('Locates Needed')) {
                    workOrder.tags = workOrder.tags ?
                        `${workOrder.tags}, Locates Needed` :
                        'Locates Needed';
                }

                if (!workOrder.metadata) {
                    workOrder.metadata = {};
                }
                workOrder.metadata.manuallyTaggedAt = new Date();
                workOrder.metadata.tagAddedBy = name;
                workOrder.metadata.tagAddedByEmail = email;
                workOrder.metadata.tagUpdatedAt = new Date();

                await dashboard.save();

                results.successful.push({
                    workOrderNumber,
                    message: "Successfully tagged"
                });

            } catch (error) {
                results.failed.push({
                    workOrderNumber,
                    reason: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Bulk tagging completed: ${results.successful.length} successful, ${results.failed.length} failed`,
            data: results
        });

    } catch (error) {
        console.error('Error in bulk tagging:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error during bulk tagging'
        });
    }
};

// NEW: Function to auto-update expired timers
const checkAndUpdateExpiredTimers = async (req, res) => {
    try {
        const now = new Date();

        // Find all work orders that are in progress and have expired
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
        console.error('Error checking expired timers:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error checking expired timers'
        });
    }
};

// NEW: Get work order by number
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
        console.error('Error getting work order:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error getting work order'
        });
    }
};

module.exports = {
    syncDashboard,
    syncAssignedDashboard,
    getAllDashboardData,
    deleteWorkOrder,
    bulkDeleteWorkOrders,
    updateWorkOrderCallStatus,
    tagLocatesNeeded,
    bulkTagLocatesNeeded,
    checkAndUpdateExpiredTimers,
    getWorkOrderByNumber,
};