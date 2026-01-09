const express = require('express');
const { 
    getAllDashboardData, 
    syncDashboard, 
    deleteWorkOrder, 
    bulkDeleteWorkOrders, 
    syncAssignedDashboard,
    updateWorkOrderCallStatus,
    getExcavatorLocatesNeedingCalls,
    bulkUpdateCallStatus,
    tagLocatesNeeded,
    getAllLocatesWithStatus,
    getLocatesStatistics,
    cleanupExpiredLocates,
    getInProgressLocates,
    getCompletedLocates
} = require('../controllers/locatesController');

const router = express.Router();

// Existing routes
router.get('/all-locates', getAllDashboardData);
router.get('/sync-dashboard', syncDashboard);
router.get('/sync-assigned-dashboard', syncAssignedDashboard);
router.delete('/delete-locate/:id', deleteWorkOrder);
router.delete('/work-order/bulk-delete', bulkDeleteWorkOrders);

// NEW ROUTES for excavator locate call status
router.patch('/work-order/:id/update-call-status', updateWorkOrderCallStatus);
router.get('/excavator-needing-calls', getExcavatorLocatesNeedingCalls);
router.post('/work-order/bulk-update-call-status', bulkUpdateCallStatus);

// NEW ROUTES for three-stage workflow
router.post('/tag-locates-needed', tagLocatesNeeded);
router.get('/all-with-status', getAllLocatesWithStatus);
router.get('/statistics', getLocatesStatistics);
router.post('/cleanup-expired', cleanupExpiredLocates);
router.get('/in-progress', getInProgressLocates);
router.get('/completed', getCompletedLocates);

module.exports = router;