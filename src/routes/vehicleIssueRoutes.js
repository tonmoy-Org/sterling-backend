const express = require('express');
const router = express.Router();
const issueController = require('../controllers/vehicleIssueController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');


// Protected routes
router.use(protect);

// Issue Routes
router.route('/')
    .get(authorize('manager', 'superadmin', 'tech'), issueController.getAllIssues)
    .post(authorize('manager', 'superadmin', 'tech'), issueController.createIssue);

router.route('/stats/dashboard')
    .get(authorize('manager', 'superadmin'), issueController.getDashboardStats);

router.route('/vehicle/:vehicleId')
    .get(authorize('manager', 'superadmin', 'tech'), issueController.getIssuesByVehicle);

router.route('/:id')
    .get(authorize('manager', 'superadmin', 'tech'), issueController.getIssueById)
    .put(authorize('manager', 'superadmin'), issueController.updateIssue);

router.route('/:id/status')
    .patch(authorize('manager', 'superadmin', 'tech'), issueController.updateIssueStatus);

router.route('/:id/assign')
    .patch(authorize('manager', 'superadmin'), issueController.assignIssueToTechnician);

router.route('/:id/notes')
    .post(authorize('manager', 'superadmin', 'tech'), issueController.addIssueNote);

router.route('/:id/images')
    .post(
        authorize('manager', 'superadmin', 'tech'),
        upload.array('images', 10),
        issueController.uploadIssueImages
    );

router.route('/:id/parts')
    .post(authorize('manager', 'superadmin'), issueController.addPartsUsed);

module.exports = router;