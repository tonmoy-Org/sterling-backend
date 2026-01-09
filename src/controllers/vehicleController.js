const Vehicle = require('../models/Vehicle');
const VehicleIssue = require('../models/VehicleIssue');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const { uploadToCloudinary } = require('../../utils/cloudinary');
const mongoose = require('mongoose');

const getAllVehicles = asyncHandler(async (req, res) => {
    const {
        status,
        vehicleType,
        assignedTo,
        search,
        page = 1,
        limit = 10
    } = req.query;

    const query = { isActive: true };

    if (status && status !== 'ALL') {
        query.status = status;
    }

    if (vehicleType && vehicleType !== 'ALL') {
        query.vehicleType = vehicleType;
    }

    if (assignedTo && assignedTo !== 'ALL') {
        if (assignedTo === 'UNASSIGNED') {
            query.assignedTechnicianId = { $exists: false };
        } else {
            query.assignedTechnicianId = assignedTo;
        }
    }

    if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { truckNumber: searchRegex },
            { licensePlate: searchRegex },
            { make: searchRegex },
            { model: searchRegex },
            { vin: searchRegex }
        ];
    }

    const skip = (page - 1) * limit;

    const vehicles = await Vehicle.find(query)
        .populate('assignedTechnician', 'name email employeeId phone')
        .populate('activeIssues')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await Vehicle.countDocuments(query);

    const stats = await Vehicle.aggregate([
        { $match: { isActive: true } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const statusStats = {
        AVAILABLE: 0,
        IN_USE: 0,
        MAINTENANCE: 0,
        OUT_OF_SERVICE: 0
    };

    stats.forEach(stat => {
        statusStats[stat._id] = stat.count;
    });

    res.json({
        success: true,
        data: vehicles,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        },
        stats: statusStats
    });
});

const getVehicleById = asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findById(req.params.id)
        .populate('assignedTechnician', 'name email employeeId phone avatar')
        .populate('activeIssues')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('statusHistory.changedBy', 'name email')
        .populate('assignmentHistory.technicianId', 'name employeeId')
        .populate('assignmentHistory.assignedBy', 'name email')
        .populate('assignmentHistory.unassignedBy', 'name email');

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    const issues = await VehicleIssue.find({ vehicleId: vehicle._id })
        .populate('reportedBy', 'name email')
        .populate('assignedTo', 'name email')
        .sort({ priority: -1, createdAt: -1 });

    res.json({
        success: true,
        data: {
            ...vehicle.toObject(),
            issues
        }
    });
});

const createVehicle = asyncHandler(async (req, res) => {
    if (!req.user || !req.user._id) {
        res.status(401);
        throw new Error('User not authenticated');
    }

    const {
        truckNumber,
        licensePlate,
        vin,
        vehicleType,
        make,
        model,
        year,
        color,
        capacity,
        capacityUnit,
        pumpType,
        fuelType,
        assignedTechnicianId,
        notes
    } = req.body;

    if (!truckNumber || !licensePlate) {
        res.status(400);
        throw new Error('Truck number and license plate are required');
    }

    const existingVehicle = await Vehicle.findOne({
        $or: [
            { truckNumber: truckNumber?.toUpperCase() },
            { licensePlate: licensePlate?.toUpperCase() },
            ...(vin ? [{ vin: vin.toUpperCase() }] : [])
        ]
    });

    if (existingVehicle) {
        res.status(400);
        throw new Error('Vehicle with this truck number, license plate, or VIN already exists');
    }

    const vehicleData = {
        truckNumber: truckNumber.toUpperCase(),
        licensePlate: licensePlate.toUpperCase(),
        vin: vin?.toUpperCase(),
        vehicleType: vehicleType || 'SERVICE_TRUCK',
        make,
        model,
        year,
        color,
        capacity: capacity || undefined,
        capacityUnit: capacityUnit || 'GALLONS',
        pumpType: pumpType || undefined,
        fuelType: fuelType || 'DIESEL',
        notes,
        createdBy: req.user?.id,
        status: 'AVAILABLE',
        statusHistory: [{
            status: 'AVAILABLE',
            changedBy: req.user?.id,
            reason: 'Vehicle created'
        }]
    };

    if (assignedTechnicianId) {
        const technician = await User.findById(assignedTechnicianId);
        if (!technician || technician.role !== 'tech' || !technician.isActive) {
            res.status(400);
            throw new Error('Invalid technician');
        }

        vehicleData.assignedTechnicianId = assignedTechnicianId;
        vehicleData.status = 'IN_USE';
        vehicleData.currentAssignment = {
            technicianId: assignedTechnicianId,
            technicianName: technician.name,
            assignmentDate: new Date()
        };

        vehicleData.assignmentHistory = [{
            technicianId: assignedTechnicianId,
            technicianName: technician.name,
            assignedBy: req.user.id,
            assignedDate: new Date(),
            notes: 'Initial assignment on vehicle creation'
        }];

        vehicleData.statusHistory.push({
            status: 'IN_USE',
            changedBy: req.user.id,
            reason: `Assigned to ${technician.name} on creation`
        });
    }

    const vehicle = await Vehicle.create(vehicleData);

    const populatedVehicle = await Vehicle.findById(vehicle._id)
        .populate('createdBy', 'name email')
        .populate('assignedTechnician', 'name email employeeId phone');

    res.status(201).json({
        success: true,
        message: 'Vehicle created successfully',
        data: populatedVehicle
    });
});

const updateVehicle = asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    const { truckNumber, licensePlate, vin } = req.body;

    if (truckNumber && truckNumber.toUpperCase() !== vehicle.truckNumber) {
        const existing = await Vehicle.findOne({
            truckNumber: truckNumber.toUpperCase(),
            _id: { $ne: vehicle._id }
        });

        if (existing) {
            res.status(400);
            throw new Error('Truck number already exists');
        }
    }

    if (licensePlate && licensePlate.toUpperCase() !== vehicle.licensePlate) {
        const existing = await Vehicle.findOne({
            licensePlate: licensePlate.toUpperCase(),
            _id: { $ne: vehicle._id }
        });

        if (existing) {
            res.status(400);
            throw new Error('License plate already exists');
        }
    }

    const updatedData = {
        ...req.body,
        updatedBy: req.user?.id
    };

    if (truckNumber) updatedData.truckNumber = truckNumber.toUpperCase();
    if (licensePlate) updatedData.licensePlate = licensePlate.toUpperCase();
    if (vin) updatedData.vin = vin.toUpperCase();

    const updatedVehicle = await Vehicle.findByIdAndUpdate(
        req.params.id,
        updatedData,
        { new: true, runValidators: true }
    ).populate('updatedBy', 'name email');

    res.json({
        success: true,
        message: 'Vehicle updated successfully',
        data: updatedVehicle
    });
});

const deleteVehicle = asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    if (vehicle.status === 'IN_USE') {
        res.status(400);
        throw new Error('Cannot delete vehicle that is currently in use');
    }

    if (vehicle.activeIssues && vehicle.activeIssues.length > 0) {
        const activeIssues = await VehicleIssue.find({
            _id: { $in: vehicle.activeIssues },
            status: { $in: ['OPEN', 'IN_PROGRESS'] }
        });

        if (activeIssues.length > 0) {
            res.status(400);
            throw new Error('Cannot delete vehicle with active issues');
        }
    }

    vehicle.isActive = false;
    vehicle.updatedBy = req.user?.id;
    await vehicle.save();

    res.json({
        success: true,
        message: 'Vehicle deleted successfully'
    });
});

const updateVehicleStatus = asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    const validStatuses = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'OUT_OF_SERVICE'];
    if (!validStatuses.includes(status)) {
        res.status(400);
        throw new Error('Invalid status');
    }

    if (status === 'IN_USE' && vehicle.status === 'MAINTENANCE') {
        res.status(400);
        throw new Error('Cannot dispatch vehicle under maintenance');
    }

    if (status === 'IN_USE' && vehicle.status === 'OUT_OF_SERVICE') {
        res.status(400);
        throw new Error('Cannot dispatch out-of-service vehicle');
    }

    if (status === 'IN_USE') {
        const criticalIssues = await VehicleIssue.find({
            vehicleId: vehicle?._id,
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            preventsDispatch: true
        });

        if (criticalIssues.length > 0) {
            res.status(400);
            throw new Error('Cannot dispatch vehicle with critical issues');
        }
    }

    const oldStatus = vehicle.status;
    vehicle.status = status;
    vehicle.updatedBy = req.user?.id;

    vehicle.statusHistory.push({
        status,
        changedBy: req.user?.id,
        reason: reason || `Status changed from ${oldStatus} to ${status}`
    });

    await vehicle.save();

    const populatedVehicle = await Vehicle.findById(vehicle._id)
        .populate('updatedBy', 'name email')
        .populate('statusHistory.changedBy', 'name email');

    res.json({
        success: true,
        message: `Vehicle status updated to ${status}`,
        data: populatedVehicle,
        oldStatus,
        newStatus: status
    });
});

const assignVehicleToTechnician = asyncHandler(async (req, res) => {
    const { technicianId, jobId, jobNumber, notes } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    if (vehicle.status !== 'AVAILABLE') {
        res.status(400);
        throw new Error(`Cannot assign vehicle with status: ${vehicle.status}`);
    }

    const technician = await User.findById(technicianId);
    if (!technician || technician.role !== 'tech' || !technician.isActive) {
        res.status(400);
        throw new Error('Invalid technician');
    }

    const existingAssignment = await Vehicle.findOne({
        assignedTechnicianId: technicianId,
        status: 'IN_USE',
        isActive: true,
        _id: { $ne: vehicle._id }
    });

    if (existingAssignment) {
        res.status(400);
        throw new Error('Technician is already assigned to another vehicle');
    }

    const oldTechnicianId = vehicle.assignedTechnicianId;
    vehicle.assignedTechnicianId = technicianId;
    vehicle.status = 'IN_USE';
    vehicle.currentAssignment = {
        technicianId,
        technicianName: technician.name,
        assignmentDate: new Date(),
        jobId,
        jobNumber
    };
    vehicle.updatedBy = req.user._id;

    vehicle.assignmentHistory.push({
        technicianId,
        technicianName: technician.name,
        assignedBy: req.user._id,
        assignedDate: new Date(),
        notes
    });

    vehicle.statusHistory.push({
        status: 'IN_USE',
        changedBy: req.user._id,
        reason: `Assigned to ${technician.name}${jobNumber ? ` for job ${jobNumber}` : ''}`
    });

    await vehicle.save();

    const populatedVehicle = await Vehicle.findById(vehicle._id)
        .populate('assignedTechnician', 'name email employeeId phone')
        .populate('updatedBy', 'name email');

    res.json({
        success: true,
        message: `Vehicle assigned to ${technician.name}`,
        data: populatedVehicle
    });
});

const unassignVehicleFromTechnician = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    if (!vehicle.assignedTechnicianId) {
        res.status(400);
        throw new Error('Vehicle is not assigned to any technician');
    }

    const technician = await User.findById(vehicle.assignedTechnicianId);

    const currentAssignment = vehicle.assignmentHistory.find(
        assignment => !assignment.unassignedDate
    );

    if (currentAssignment) {
        currentAssignment.unassignedDate = new Date();
        currentAssignment.unassignedBy = req.user._id;
        currentAssignment.notes = reason || 'Vehicle unassigned';
    }

    vehicle.assignedTechnicianId = null;
    vehicle.currentAssignment = null;
    vehicle.status = 'AVAILABLE';
    vehicle.updatedBy = req.user._id;

    vehicle.statusHistory.push({
        status: 'AVAILABLE',
        changedBy: req.user._id,
        reason: `Unassigned from ${technician?.name || 'technician'}`
    });

    await vehicle.save();

    res.json({
        success: true,
        message: 'Vehicle unassigned successfully',
        data: vehicle
    });
});

const uploadVehiclePhotos = asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    if (!req.files || !req.files.photos) {
        res.status(400);
        throw new Error('No photos uploaded');
    }

    const photos = Array.isArray(req.files.photos)
        ? req.files.photos
        : [req.files.photos];

    const uploadedPhotos = [];

    for (const photo of photos) {
        try {
            const result = await uploadToCloudinary(photo, 'vehicle-photos');

            uploadedPhotos.push({
                url: result.secure_url,
                caption: req.body.caption || `Uploaded on ${new Date().toLocaleDateString()}`,
                uploadedBy: req.user._id,
                uploadedAt: new Date()
            });
        } catch (error) {
            console.error('Error uploading photo:', error);
        }
    }

    vehicle.photos.push(...uploadedPhotos);
    vehicle.updatedBy = req.user._id;
    await vehicle.save();

    res.json({
        success: true,
        message: `${uploadedPhotos.length} photos uploaded successfully`,
        data: uploadedPhotos
    });
});

const getVehicleStats = asyncHandler(async (req, res) => {
    const totalVehicles = await Vehicle.countDocuments({ isActive: true });

    const statusStats = await Vehicle.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const typeStats = await Vehicle.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$vehicleType', count: { $sum: 1 } } }
    ]);

    const assignedStats = await Vehicle.aggregate([
        { $match: { isActive: true } },
        {
            $group: {
                _id: { $cond: [{ $ifNull: ['$assignedTechnicianId', false] }, 'ASSIGNED', 'UNASSIGNED'] },
                count: { $sum: 1 }
            }
        }
    ]);

    const maintenanceNeeded = await Vehicle.countDocuments({
        isActive: true,
        nextMaintenanceDate: { $lte: new Date() }
    });

    const vehiclesWithIssues = await Vehicle.countDocuments({
        isActive: true,
        activeIssues: { $exists: true, $ne: [] }
    });

    res.json({
        success: true,
        data: {
            totalVehicles,
            status: Object.fromEntries(statusStats.map(stat => [stat._id, stat.count])),
            types: Object.fromEntries(typeStats.map(stat => [stat._id, stat.count])),
            assignment: Object.fromEntries(assignedStats.map(stat => [stat._id, stat.count])),
            maintenanceNeeded,
            vehiclesWithIssues
        }
    });
});

const getVehiclesByTechnician = asyncHandler(async (req, res) => {
    const vehicles = await Vehicle.find({
        assignedTechnicianId: req.params.technicianId,
        isActive: true
    })
        .populate('assignedTechnician', 'name email employeeId')
        .populate('activeIssues')
        .sort({ status: 1 });

    res.json({
        success: true,
        data: vehicles
    });
});

const updateVehicleLocation = asyncHandler(async (req, res) => {
    const { latitude, longitude, address } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    vehicle.lastKnownLocation = {
        type: 'Point',
        coordinates: [longitude, latitude],
        address,
        timestamp: new Date()
    };
    vehicle.updatedBy = req.user._id;

    await vehicle.save();

    res.json({
        success: true,
        message: 'Vehicle location updated',
        data: vehicle.lastKnownLocation
    });
});

module.exports = {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle,
    updateVehicleStatus,
    assignVehicleToTechnician,
    unassignVehicleFromTechnician,
    uploadVehiclePhotos,
    getVehicleStats,
    getVehiclesByTechnician,
    updateVehicleLocation
};