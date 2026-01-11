const express = require('express');
const router = express.Router();
const {
    syncDashboard,
    syncAssignedDashboard,
    getAllDashboardData,
    deleteWorkOrder,
    bulkDeleteWorkOrders,
    updateWorkOrderCallStatus,
    tagLocatesNeeded,
    bulkTagLocatesNeeded,
    checkAndUpdateExpiredTimers,
    getWorkOrderByNumber
} = require('../controllers/locatesController');
const auth = require('../middleware/auth');

// Protect all routes
router.use(auth.protect);

// Existing routes
router.get('/sync-dashboard', syncDashboard);
router.get('/sync-assigned-dashboard', syncAssignedDashboard);
router.get('/all-locates', getAllDashboardData);
router.delete('/work-order/bulk-delete', bulkDeleteWorkOrders);
router.delete('/work-order/:id', deleteWorkOrder);
router.patch('/work-order/:id/update-call-status', updateWorkOrderCallStatus);

// NEW: Manual tagging routes
router.post('/tag-locates-needed', tagLocatesNeeded);
router.post('/bulk-tag-locates-needed', bulkTagLocatesNeeded);

// Timer and work order management routes
router.get('/check-expired-timers', checkAndUpdateExpiredTimers);
router.get('/work-order/:workOrderNumber', getWorkOrderByNumber);

module.exports = router;