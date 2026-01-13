const express = require('express');
const router = express.Router();
const {
    syncDashboard,
    syncAssignedDashboard,
    getAllDashboardData,
    deleteWorkOrder,
    bulkDeleteWorkOrders,
    updateWorkOrderCallStatus,
    checkAndUpdateExpiredTimers,
    getWorkOrderByNumber,
    completeWorkOrderManually,
    getDeletedHistory,
    restoreWorkOrder,
    permanentlyDeleteFromHistory,
    bulkPermanentlyDelete,
    clearAllHistory,
    getDashboardWithHistory,
} = require('../controllers/locatesController');
const auth = require('../middleware/auth');

router.get('/sync-dashboard', syncDashboard);
router.get('/sync-assigned-dashboard', syncAssignedDashboard);

// Protect all routes
router.use(auth.protect);

// Existing routes
router.get('/all-locates', getAllDashboardData);
router.delete('/work-order/bulk-delete', bulkDeleteWorkOrders);
router.delete('/work-order/:id', deleteWorkOrder);
router.patch('/work-order/:id/update-call-status', updateWorkOrderCallStatus);

// Manual complete work order (before time)
router.patch('/work-order/:id/complete', completeWorkOrderManually);

// Timer and work order management routes
router.get('/check-expired-timers', checkAndUpdateExpiredTimers);
router.get('/work-order/:workOrderNumber', getWorkOrderByNumber);

// NEW: History management routes
router.get('/deleted-history', getDeletedHistory);
router.get('/dashboard/:id/history', getDashboardWithHistory);
router.post('/history/:dashboardId/:deletedOrderId/restore', restoreWorkOrder);
router.delete('/history/:dashboardId/:deletedOrderId/permanent', permanentlyDeleteFromHistory);
router.delete('/history/bulk-permanent-delete', bulkPermanentlyDelete);
router.delete('/history/clear-all', clearAllHistory);

module.exports = router;