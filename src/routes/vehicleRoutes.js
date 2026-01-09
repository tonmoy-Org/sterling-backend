const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const upload = require('../middleware/upload');

router.get('/', vehicleController.getAllVehicles);
router.get('/stats/overview', vehicleController.getVehicleStats);
router.get('/technician/:technicianId', vehicleController.getVehiclesByTechnician);
router.get('/:id', vehicleController.getVehicleById);

router.post('/', vehicleController.createVehicle);
router.put('/:id', vehicleController.updateVehicle);

router.delete('/:id', vehicleController.deleteVehicle);

router.patch('/:id/status', vehicleController.updateVehicleStatus);
router.patch('/:id/assign', vehicleController.assignVehicleToTechnician);
router.patch('/:id/unassign', vehicleController.unassignVehicleFromTechnician);
router.patch('/:id/location', vehicleController.updateVehicleLocation);

router.post(
    '/:id/photos',
    upload.array('photos', 10),
    vehicleController.uploadVehiclePhotos
);

module.exports = router;