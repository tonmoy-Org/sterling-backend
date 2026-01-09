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
        // const saved = await DashboardData.create(data);

        // res.json({
        //     success: true,
        //     message: 'Dashboard synced successfully',
        //     data: saved
        // });
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
    try {
        const { ids } = req.body;

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

// NEW: Update call status for excavator locates
const updateWorkOrderCallStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { locatesCalled, callType, calledAt, calledBy } = req.body;
        console.log('updateWorkOrderCallStatus', req.body);

        // Validate input
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

        if (locatesCalled && !calledBy) {
            return res.status(400).json({
                success: false,
                message: "Manager name (calledBy) is required when marking locates as called"
            });
        }

        // Find the dashboard containing the work order
        const dashboard = await DashboardData.findOne({
            "workOrders._id": id
        });

        if (!dashboard) {
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
            return res.status(404).json({
                success: false,
                message: "Work order not found in dashboard"
            });
        }

        // Update the work order
        dashboard.workOrders[workOrderIndex].locatesCalled = locatesCalled;
        
        if (callType) {
            dashboard.workOrders[workOrderIndex].callType = callType.toUpperCase();
        }
        
        if (calledBy) {
            dashboard.workOrders[workOrderIndex].calledBy = calledBy;
        }
        
        if (calledAt) {
            dashboard.workOrders[workOrderIndex].calledAt = calledAt;
        } else if (locatesCalled) {
            // Auto-set calledAt if not provided but locatesCalled is true
            dashboard.workOrders[workOrderIndex].calledAt = new Date().toISOString();
        }

        // Calculate completion date based on call type
        if (locatesCalled && callType) {
            const calledDate = new Date(dashboard.workOrders[workOrderIndex].calledAt);
            if (callType.toUpperCase() === 'EMERGENCY') {
                // Emergency: 4 hours from called time
                dashboard.workOrders[workOrderIndex].completionDate = new Date(calledDate.getTime() + (4 * 60 * 60 * 1000));
            } else {
                // Standard: 2 business days from called time
                // Simple implementation - for production, use a proper business days library
                const completionDate = new Date(calledDate);
                let businessDays = 2;
                while (businessDays > 0) {
                    completionDate.setDate(completionDate.getDate() + 1);
                    // Skip weekends (0 = Sunday, 6 = Saturday)
                    if (completionDate.getDay() !== 0 && completionDate.getDay() !== 6) {
                        businessDays--;
                    }
                }
                dashboard.workOrders[workOrderIndex].completionDate = completionDate;
            }
        }

        // Also update the priority or add metadata if needed
        if (!dashboard.workOrders[workOrderIndex].metadata) {
            dashboard.workOrders[workOrderIndex].metadata = {};
        }
        
        dashboard.workOrders[workOrderIndex].metadata.lastCallStatusUpdate = new Date().toISOString();
        dashboard.workOrders[workOrderIndex].metadata.updatedBy = req.user?._id || 'system';

        // Save the updated dashboard
        await dashboard.save();

        // Return the updated work order
        const updatedWorkOrder = dashboard.workOrders[workOrderIndex];

        res.json({
            success: true,
            message: `Work order call status updated successfully`,
            data: {
                workOrder: updatedWorkOrder,
                updates: {
                    locatesCalled,
                    callType: callType?.toUpperCase(),
                    calledAt: updatedWorkOrder.calledAt,
                    calledBy: updatedWorkOrder.calledBy,
                    completionDate: updatedWorkOrder.completionDate
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

// NEW: Get excavator locates that need calls
const getExcavatorLocatesNeedingCalls = async (req, res) => {
    try {
        const dashboards = await DashboardData.find({
            "workOrders.priorityName": { $regex: 'excavator', $options: 'i' }
        });

        if (!dashboards || dashboards.length === 0) {
            return res.json({
                success: true,
                total: 0,
                data: []
            });
        }

        // Extract excavator work orders that need calls
        const excavatorLocates = [];
        dashboards.forEach(dashboard => {
            dashboard.workOrders.forEach(workOrder => {
                if (workOrder.priorityName && 
                    workOrder.priorityName.toUpperCase() === 'EXCAVATOR' &&
                    !workOrder.locatesCalled) {
                    
                    excavatorLocates.push({
                        ...workOrder.toObject(),
                        dashboardId: dashboard._id
                    });
                }
            });
        });

        res.json({
            success: true,
            total: excavatorLocates.length,
            data: excavatorLocates
        });

    } catch (error) {
        console.error('Error fetching excavator locates:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error fetching excavator locates'
        });
    }
};

// NEW: Bulk update call status for multiple excavator locates
const bulkUpdateCallStatus = async (req, res) => {
    try {
        const { ids, callType, calledBy } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of work order IDs"
            });
        }

        if (!callType || !['STANDARD', 'EMERGENCY'].includes(callType.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: "callType must be either 'STANDARD' or 'EMERGENCY'"
            });
        }

        if (!calledBy) {
            return res.status(400).json({
                success: false,
                message: "Manager name (calledBy) is required"
            });
        }

        // Find dashboards containing the work orders
        const dashboards = await DashboardData.find({
            "workOrders._id": { $in: ids }
        });

        if (dashboards.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No matching work orders found"
            });
        }

        const updatedCount = { total: 0, successful: 0, failed: 0 };
        const updatePromises = [];

        dashboards.forEach(dashboard => {
            dashboard.workOrders.forEach((workOrder, index) => {
                if (ids.includes(workOrder._id.toString())) {
                    updatedCount.total++;
                    
                    // Only update excavator priority work orders or manually tagged ones
                    if ((workOrder.priorityName && 
                         workOrder.priorityName.toUpperCase() === 'EXCAVATOR') ||
                        workOrder.manuallyTagged) {
                        
                        const updatePromise = (async () => {
                            try {
                                dashboard.workOrders[index].locatesCalled = true;
                                dashboard.workOrders[index].callType = callType.toUpperCase();
                                dashboard.workOrders[index].calledBy = calledBy;
                                dashboard.workOrders[index].calledAt = new Date().toISOString();
                                
                                // Calculate completion date
                                const calledDate = new Date();
                                if (callType.toUpperCase() === 'EMERGENCY') {
                                    dashboard.workOrders[index].completionDate = new Date(calledDate.getTime() + (4 * 60 * 60 * 1000));
                                } else {
                                    const completionDate = new Date(calledDate);
                                    let businessDays = 2;
                                    while (businessDays > 0) {
                                        completionDate.setDate(completionDate.getDate() + 1);
                                        if (completionDate.getDay() !== 0 && completionDate.getDay() !== 6) {
                                            businessDays--;
                                        }
                                    }
                                    dashboard.workOrders[index].completionDate = completionDate;
                                }
                                
                                // Add metadata
                                if (!dashboard.workOrders[index].metadata) {
                                    dashboard.workOrders[index].metadata = {};
                                }
                                dashboard.workOrders[index].metadata.lastCallStatusUpdate = new Date().toISOString();
                                dashboard.workOrders[index].metadata.updatedBy = req.user?._id || 'system';
                                dashboard.workOrders[index].metadata.bulkUpdate = true;
                                
                                await dashboard.save();
                                updatedCount.successful++;
                            } catch (error) {
                                console.error(`Failed to update work order ${workOrder._id}:`, error);
                                updatedCount.failed++;
                            }
                        })();
                        
                        updatePromises.push(updatePromise);
                    } else {
                        updatedCount.failed++; // Not an excavator or manually tagged work order
                    }
                }
            });
        });

        await Promise.all(updatePromises);

        res.json({
            success: true,
            message: `Call status updated for ${updatedCount.successful} excavator locate(s)`,
            data: {
                totalRequested: ids.length,
                totalProcessed: updatedCount.total,
                successful: updatedCount.successful,
                failed: updatedCount.failed,
                callType: callType.toUpperCase(),
                calledBy
            }
        });

    } catch (error) {
        console.error('Error in bulk update call status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error during bulk update'
        });
    }
};

// NEW: Manually tag locates needed
const tagLocatesNeeded = async (req, res) => {
    console.log('tagLocatesNeeded', req.body);
    // try {
    //     const { workOrderNumber, technician, taggedBy } = req.body;

    //     // Validate required fields
    //     if (!jobId || !customerName || !address) {
    //         return res.status(400).json({
    //             success: false,
    //             message: "Job ID, Customer Name, and Address are required"
    //         });
    //     }

    //     // Create a new work order with manual tag
    //     const manualWorkOrder = {
    //         workOrderNumber: jobId,
    //         techName: technician || 'Unassigned',
    //         technician: technician || 'Unassigned',
    //         manuallyTagged: true,
    //         taggedBy: taggedBy || req.user?.name || 'Unknown',
    //         taggedAt: new Date().toISOString(),
    //         metadata: {
    //             createdBy: 'manual_tag',
    //             createdAt: new Date().toISOString()
    //         }
    //     };

    //     // Check if there's already a dashboard for today
    //     const today = new Date();
    //     today.setHours(0, 0, 0, 0);
        
    //     let dashboard = await DashboardData.findOne({
    //         createdAt: { $gte: today }
    //     });

    //     if (!dashboard) {
    //         // Create new dashboard for today
    //         dashboard = new DashboardData({
    //             workOrders: [manualWorkOrder],
    //             totalWorkOrders: 1,
    //             metadata: {
    //                 hasManualTags: true
    //             }
    //         });
    //     } else {
    //         // Add to existing dashboard
    //         dashboard.workOrders.push(manualWorkOrder);
    //         dashboard.totalWorkOrders = dashboard.workOrders.length;
    //         if (!dashboard.metadata) dashboard.metadata = {};
    //         dashboard.metadata.hasManualTags = true;
    //     }

    //     await dashboard.save();

    //     res.json({
    //         success: true,
    //         message: "Locates needed tag created successfully",
    //         data: {
    //             workOrder: manualWorkOrder,
    //             dashboardId: dashboard._id
    //         }
    //     });

    // } catch (error) {
    //     console.error('Error creating manual tag:', error);
    //     res.status(500).json({
    //         success: false,
    //         message: error.message || 'Server error creating manual tag'
    //     });
    // }
};

// NEW: Get all locates with timer status
const getAllLocatesWithStatus = async (req, res) => {
    try {
        const { status } = req.query; // Optional: 'call-needed', 'in-progress', 'complete'

        const dashboards = await DashboardData.find().sort({ createdAt: -1 });

        if (!dashboards || dashboards.length === 0) {
            return res.json({
                success: true,
                total: 0,
                data: []
            });
        }

        // Flatten all work orders
        const allWorkOrders = [];
        dashboards.forEach(dashboard => {
            dashboard.workOrders.forEach(workOrder => {
                const workOrderObj = workOrder.toObject();
                
                // Determine status
                let workOrderStatus = 'unknown';
                
                if (workOrderObj.manuallyTagged || 
                    (workOrderObj.priorityName && 
                     workOrderObj.priorityName.toUpperCase() === 'EXCAVATOR' &&
                     !workOrderObj.locatesCalled)) {
                    workOrderStatus = 'call-needed';
                } else if (workOrderObj.locatesCalled && workOrderObj.completionDate) {
                    const now = new Date();
                    const completionDate = new Date(workOrderObj.completionDate);
                    
                    if (completionDate > now) {
                        workOrderStatus = 'in-progress';
                    } else {
                        workOrderStatus = 'complete';
                    }
                }
                
                allWorkOrders.push({
                    ...workOrderObj,
                    dashboardId: dashboard._id,
                    status: workOrderStatus,
                    // Calculate time remaining if in progress
                    timeRemaining: workOrderStatus === 'in-progress' ? 
                        Math.max(0, Math.ceil((completionDate - now) / (1000 * 60 * 60))) : null // hours
                });
            });
        });

        // Filter by status if provided
        let filteredWorkOrders = allWorkOrders;
        if (status) {
            filteredWorkOrders = allWorkOrders.filter(workOrder => workOrder.status === status);
        }

        res.json({
            success: true,
            total: filteredWorkOrders.length,
            filteredBy: status || 'all',
            data: filteredWorkOrders
        });

    } catch (error) {
        console.error('Error fetching locates with status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error fetching locates with status'
        });
    }
};

// NEW: Get statistics for dashboard
const getLocatesStatistics = async (req, res) => {
    try {
        const dashboards = await DashboardData.find().sort({ createdAt: -1 });

        let callNeeded = 0;
        let inProgress = 0;
        let complete = 0;
        let manualTags = 0;
        let autoGenerated = 0;

        const now = new Date();

        dashboards.forEach(dashboard => {
            dashboard.workOrders.forEach(workOrder => {
                // Count manual vs auto
                if (workOrder.manuallyTagged) {
                    manualTags++;
                } else {
                    autoGenerated++;
                }

                // Determine status
                if (workOrder.manuallyTagged || 
                    (workOrder.priorityName && 
                     workOrder.priorityName.toUpperCase() === 'EXCAVATOR' &&
                     !workOrder.locatesCalled)) {
                    callNeeded++;
                } else if (workOrder.locatesCalled && workOrder.completionDate) {
                    const completionDate = new Date(workOrder.completionDate);
                    
                    if (completionDate > now) {
                        inProgress++;
                    } else {
                        complete++;
                    }
                }
            });
        });

        res.json({
            success: true,
            data: {
                total: callNeeded + inProgress + complete,
                callNeeded,
                inProgress,
                complete,
                breakdown: {
                    manualTags,
                    autoGenerated
                },
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching locates statistics:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error fetching statistics'
        });
    }
};

// NEW: Clean up expired locates (auto-move from in-progress to complete)
const cleanupExpiredLocates = async (req, res) => {
    try {
        const dashboards = await DashboardData.find({
            "workOrders.locatesCalled": true,
            "workOrders.completionDate": { $lte: new Date() }
        });

        if (dashboards.length === 0) {
            return res.json({
                success: true,
                message: "No expired locates found",
                updatedCount: 0
            });
        }

        let updatedCount = 0;

        const updatePromises = dashboards.map(dashboard => {
            let hasChanges = false;
            
            dashboard.workOrders.forEach(workOrder => {
                if (workOrder.locatesCalled && workOrder.completionDate) {
                    const completionDate = new Date(workOrder.completionDate);
                    const now = new Date();
                    
                    if (completionDate <= now) {
                        // Mark as expired if not already
                        if (!workOrder.metadata) workOrder.metadata = {};
                        workOrder.metadata.expiredAt = now.toISOString();
                        workOrder.metadata.autoMovedToComplete = true;
                        hasChanges = true;
                        updatedCount++;
                    }
                }
            });
            
            if (hasChanges) {
                return dashboard.save();
            }
            return Promise.resolve();
        });

        await Promise.all(updatePromises);

        res.json({
            success: true,
            message: `Cleaned up ${updatedCount} expired locate(s)`,
            data: {
                updatedCount,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error cleaning up expired locates:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error cleaning up expired locates'
        });
    }
};

// NEW: Get in-progress locates with timer details
const getInProgressLocates = async (req, res) => {
    try {
        const now = new Date();
        const dashboards = await DashboardData.find({
            "workOrders.locatesCalled": true,
            "workOrders.completionDate": { $gt: now }
        });

        const inProgressLocates = [];

        dashboards.forEach(dashboard => {
            dashboard.workOrders.forEach(workOrder => {
                if (workOrder.locatesCalled && workOrder.completionDate) {
                    const completionDate = new Date(workOrder.completionDate);
                    
                    if (completionDate > now) {
                        // Calculate time remaining
                        const timeRemainingMs = completionDate - now;
                        const hoursRemaining = Math.floor(timeRemainingMs / (1000 * 60 * 60));
                        const minutesRemaining = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));
                        
                        inProgressLocates.push({
                            ...workOrder.toObject(),
                            dashboardId: dashboard._id,
                            timeRemaining: {
                                hours: hoursRemaining,
                                minutes: minutesRemaining,
                                totalHours: Math.ceil(timeRemainingMs / (1000 * 60 * 60))
                            },
                            completionDate: completionDate.toISOString(),
                            calledBy: workOrder.calledBy || 'Unknown',
                            callType: workOrder.callType || 'STANDARD'
                        });
                    }
                }
            });
        });

        // Sort by soonest to expire
        inProgressLocates.sort((a, b) => new Date(a.completionDate) - new Date(b.completionDate));

        res.json({
            success: true,
            total: inProgressLocates.length,
            data: inProgressLocates
        });

    } catch (error) {
        console.error('Error fetching in-progress locates:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error fetching in-progress locates'
        });
    }
};

// NEW: Get completed locates (timer expired)
const getCompletedLocates = async (req, res) => {
    try {
        const now = new Date();
        const dashboards = await DashboardData.find({
            "workOrders.locatesCalled": true,
            "workOrders.completionDate": { $lte: now }
        });

        const completedLocates = [];

        dashboards.forEach(dashboard => {
            dashboard.workOrders.forEach(workOrder => {
                if (workOrder.locatesCalled && workOrder.completionDate) {
                    const completionDate = new Date(workOrder.completionDate);
                    
                    if (completionDate <= now) {
                        completedLocates.push({
                            ...workOrder.toObject(),
                            dashboardId: dashboard._id,
                            completedAt: completionDate.toISOString(),
                            calledBy: workOrder.calledBy || 'Unknown',
                            callType: workOrder.callType || 'STANDARD',
                            timeSinceCompletion: Math.floor((now - completionDate) / (1000 * 60 * 60)) // hours since completion
                        });
                    }
                }
            });
        });

        // Sort by most recently completed
        completedLocates.sort((a, b) => new Date(b.completionDate) - new Date(a.completionDate));

        res.json({
            success: true,
            total: completedLocates.length,
            data: completedLocates
        });

    } catch (error) {
        console.error('Error fetching completed locates:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error fetching completed locates'
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
    getExcavatorLocatesNeedingCalls,
    bulkUpdateCallStatus,
    tagLocatesNeeded, // NEW
    getAllLocatesWithStatus, // NEW
    getLocatesStatistics, // NEW
    cleanupExpiredLocates, // NEW
    getInProgressLocates, // NEW
    getCompletedLocates // NEW
};