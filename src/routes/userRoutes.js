const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const validateUser = [
    body('name').trim().notEmpty().isLength({ min: 2, max: 50 }),
    body('email').trim().notEmpty().isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('role').optional().isIn(['superadmin', 'manager', 'tech']),
];

router.use(authMiddleware.protect);

const adminAccess = roleMiddleware.restrictTo('superadmin');

router.get('/', adminAccess, userController.getAllUsers);
router.get('/tech', userController.getTechRoleUsers);
router.get('/:id', adminAccess, userController.getUserById);
router.post('/', adminAccess, validateUser, userController.createUser);
router.put('/:id', adminAccess, validateUser, userController.updateUser);
router.delete('/:id', adminAccess, userController.deleteUser);
router.patch('/:id/toggle-status', adminAccess, userController.toggleUserStatus);
router.patch('/bulk-status', adminAccess, userController.bulkUpdateStatus);
router.get('/check-email/:email', adminAccess, userController.checkEmailExists);

module.exports = router;
