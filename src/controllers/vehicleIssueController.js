const VehicleIssue = require('../models/VehicleIssue');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const { uploadToCloudinary } = require('../../utils/cloudinary');

const getAllIssues = asyncHandler(async (req, res) => {
    const {
        status,
        priority,
        vehicleId,
        assignedTo,
        search,
        page = 1,
        limit = 10
    } = req.query;

    const query = {};

    if (status && status !== 'ALL') {
        query.status = status;
    }

    if (priority && priority !== 'ALL') {
        query.priority = priority;
    }

    if (vehicleId && vehicleId !== 'ALL') {
        query.vehicleId = vehicleId;
    }

    if (assignedTo && assignedTo !== 'ALL') {
        if (assignedTo === 'UNASSIGNED') {
            query.assignedTo = { $exists: false };
        } else {
            query.assignedTo = assignedTo;
        }
    }

    if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { title: searchRegex },
            { description: searchRegex },
            { resolutionNotes: searchRegex }
        ];
    }

    const skip = (page - 1) * limit;

    const issues = await VehicleIssue.find(query)
        .populate('vehicleId', 'truckNumber licensePlate vehicleType make model')
        .populate('reportedBy', 'name email employeeId')
        .populate('assignedTo', 'name email employeeId')
        .populate('createdBy', 'name email')
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await VehicleIssue.countDocuments(query);

    const stats = await VehicleIssue.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const priorityStats = await VehicleIssue.aggregate([
        {
            $group: {
                _id: '$priority',
                count: { $sum: 1 }
            }
        }
    ]);

    const statusStats = {
        OPEN: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0
    };

    const priorityCounts = {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0
    };

    stats.forEach(stat => {
        statusStats[stat._id] = stat.count;
    });

    priorityStats.forEach(stat => {
        priorityCounts[stat._id] = stat.count;
    });

    res.json({
        success: true,
        data: issues,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        },
        stats: {
            status: statusStats,
            priority: priorityCounts
        }
    });
});

const getIssueById = asyncHandler(async (req, res) => {
    const issue = await VehicleIssue.findById(req.params.id)
        .populate('vehicleId', 'truckNumber licensePlate vehicleType make model status')
        .populate('reportedBy', 'name email employeeId phone avatar')
        .populate('assignedTo', 'name email employeeId phone')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('statusHistory.changedBy', 'name email')
        .populate('notes.createdBy', 'name email avatar');

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    res.json({
        success: true,
        data: issue
    });
});

const createIssue = asyncHandler(async (req, res) => {
    const {
        vehicleId,
        title,
        description,
        type,
        priority,
        estimatedCost,
        requiresAttention,
        isSafetyCritical
    } = req.body;

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    const issue = await VehicleIssue.create({
        vehicleId,
        title,
        description,
        type,
        priority: priority || 'MEDIUM',
        estimatedCost,
        requiresAttention: requiresAttention || false,
        isSafetyCritical: isSafetyCritical || false,
        preventsDispatch: (priority === 'CRITICAL' || priority === 'HIGH' ||
            type === 'SAFETY_EQUIPMENT' || type === 'BRAKES'),
        reportedBy: req.user._id,
        reportedByName: req.user.name,
        createdBy: req.user._id,
        status: 'OPEN',
        statusHistory: [{
            status: 'OPEN',
            changedBy: req.user._id,
            changedByName: req.user.name,
            notes: 'Issue reported'
        }]
    });

    if (!vehicle.activeIssues) {
        vehicle.activeIssues = [];
    }

    vehicle.activeIssues.push(issue._id);

    if (issue.preventsDispatch && vehicle.status === 'AVAILABLE') {
        vehicle.status = 'MAINTENANCE';
        vehicle.statusHistory.push({
            status: 'MAINTENANCE',
            changedBy: req.user._id,
            reason: `Issue reported: ${title} - prevents dispatch`
        });
    }

    vehicle.updatedBy = req.user._id;
    await vehicle.save();

    const populatedIssue = await VehicleIssue.findById(issue._id)
        .populate('vehicleId', 'truckNumber licensePlate vehicleType')
        .populate('reportedBy', 'name email');

    res.status(201).json({
        success: true,
        message: 'Issue reported successfully',
        data: populatedIssue
    });
});

const updateIssue = asyncHandler(async (req, res) => {
    const issue = await VehicleIssue.findById(req.params.id);

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    const updatedData = {
        ...req.body,
        updatedBy: req.user._id,
        updatedByName: req.user.name
    };

    const updatedIssue = await VehicleIssue.findByIdAndUpdate(
        req.params.id,
        updatedData,
        { new: true, runValidators: true }
    )
        .populate('vehicleId', 'truckNumber licensePlate')
        .populate('updatedBy', 'name email');

    res.json({
        success: true,
        message: 'Issue updated successfully',
        data: updatedIssue
    });
});

const updateIssueStatus = asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    const issue = await VehicleIssue.findById(req.params.id);

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
        res.status(400);
        throw new Error('Invalid status');
    }

    const vehicle = await Vehicle.findById(issue.vehicleId);
    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    const oldStatus = issue.status;
    issue.status = status;
    issue.updatedBy = req.user._id;
    issue.updatedByName = req.user.name;

    if (status === 'IN_PROGRESS' && !issue.startDate) {
        issue.startDate = new Date();
    }

    if (status === 'RESOLVED' && !issue.resolvedDate) {
        issue.resolvedDate = new Date();
        issue.resolutionNotes = notes || 'Issue resolved';
    }

    if (status === 'CLOSED' && !issue.closedDate) {
        issue.closedDate = new Date();
    }

    issue.statusHistory.push({
        status,
        changedBy: req.user._id,
        changedByName: req.user.name,
        notes: notes || `Status changed from ${oldStatus} to ${status}`
    });

    await issue.save();

    if (status === 'RESOLVED' || status === 'CLOSED') {
        vehicle.activeIssues = vehicle.activeIssues.filter(
            issueId => issueId.toString() !== issue._id.toString()
        );

        if (vehicle.status === 'MAINTENANCE' && vehicle.activeIssues.length === 0) {
            vehicle.status = 'AVAILABLE';
            vehicle.statusHistory.push({
                status: 'AVAILABLE',
                changedBy: req.user._id,
                reason: 'All maintenance issues resolved'
            });
        }

        vehicle.updatedBy = req.user._id;
        await vehicle.save();
    }

    const populatedIssue = await VehicleIssue.findById(issue._id)
        .populate('vehicleId', 'truckNumber licensePlate status')
        .populate('updatedBy', 'name email');

    res.json({
        success: true,
        message: `Issue status updated to ${status}`,
        data: populatedIssue,
        oldStatus,
        newStatus: status
    });
});

const assignIssueToTechnician = asyncHandler(async (req, res) => {
    const { technicianId } = req.body;
    const issue = await VehicleIssue.findById(req.params.id);

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    const technician = await User.findById(technicianId);
    if (!technician || technician.role !== 'tech' || !technician.isActive) {
        res.status(400);
        throw new Error('Invalid technician');
    }

    issue.assignedTo = technicianId;
    issue.assignedToName = technician.name;
    issue.assignedDate = new Date();
    issue.status = 'IN_PROGRESS';
    issue.updatedBy = req.user._id;
    issue.updatedByName = req.user.name;

    issue.statusHistory.push({
        status: 'IN_PROGRESS',
        changedBy: req.user._id,
        changedByName: req.user.name,
        notes: `Assigned to ${technician.name}`
    });

    await issue.save();

    const populatedIssue = await VehicleIssue.findById(issue._id)
        .populate('assignedTo', 'name email employeeId')
        .populate('updatedBy', 'name email');

    res.json({
        success: true,
        message: `Issue assigned to ${technician.name}`,
        data: populatedIssue
    });
});

const addIssueNote = asyncHandler(async (req, res) => {
    const { text, isInternal } = req.body;
    const issue = await VehicleIssue.findById(req.params.id);

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    issue.notes.push({
        text,
        createdBy: req.user._id,
        createdByName: req.user.name,
        isInternal: isInternal || false
    });

    issue.updatedBy = req.user._id;
    issue.updatedByName = req.user.name;
    await issue.save();

    const populatedIssue = await VehicleIssue.findById(issue._id)
        .populate('notes.createdBy', 'name email avatar');

    const newNote = populatedIssue.notes[populatedIssue.notes.length - 1];

    res.json({
        success: true,
        message: 'Note added successfully',
        data: newNote
    });
});

const uploadIssueImages = asyncHandler(async (req, res) => {
    const issue = await VehicleIssue.findById(req.params.id);

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    if (!req.files || !req.files.images) {
        res.status(400);
        throw new Error('No images uploaded');
    }

    const images = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];

    const uploadedImages = [];

    for (const image of images) {
        try {
            const result = await uploadToCloudinary(image, 'issue-images');

            uploadedImages.push({
                url: result.secure_url,
                caption: req.body.caption || `Uploaded on ${new Date().toLocaleDateString()}`,
                uploadedBy: req.user._id,
                uploadedAt: new Date()
            });
        } catch (error) {
            console.error('Error uploading image:', error);
        }
    }

    issue.images.push(...uploadedImages);
    issue.updatedBy = req.user._id;
    issue.updatedByName = req.user.name;
    await issue.save();

    res.json({
        success: true,
        message: `${uploadedImages.length} images uploaded successfully`,
        data: uploadedImages
    });
});

const addPartsUsed = asyncHandler(async (req, res) => {
    const { parts } = req.body;
    const issue = await VehicleIssue.findById(req.params.id);

    if (!issue) {
        res.status(404);
        throw new Error('Issue not found');
    }

    if (!Array.isArray(parts) || parts.length === 0) {
        res.status(400);
        throw new Error('Parts array is required');
    }

    const processedParts = parts.map(part => ({
        partName: part.partName,
        partNumber: part.partNumber,
        quantity: part.quantity || 1,
        unitCost: part.unitCost || 0,
        totalCost: (part.quantity || 1) * (part.unitCost || 0)
    }));

    issue.partsUsed.push(...processedParts);

    const totalPartsCost = processedParts.reduce((sum, part) => sum + part.totalCost, 0);
    issue.actualCost = (issue.actualCost || 0) + totalPartsCost;

    issue.updatedBy = req.user._id;
    issue.updatedByName = req.user.name;
    await issue.save();

    res.json({
        success: true,
        message: 'Parts added successfully',
        data: {
            parts: processedParts,
            totalPartsCost,
            newActualCost: issue.actualCost
        }
    });
});

const getIssuesByVehicle = asyncHandler(async (req, res) => {
    const issues = await VehicleIssue.find({ vehicleId: req.params.vehicleId })
        .populate('reportedBy', 'name email')
        .populate('assignedTo', 'name email')
        .sort({ priority: -1, createdAt: -1 });

    res.json({
        success: true,
        data: issues
    });
});

const getDashboardStats = asyncHandler(async (req, res) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totalIssues = await VehicleIssue.countDocuments();

    const openIssues = await VehicleIssue.countDocuments({ status: 'OPEN' });

    const priorityStats = await VehicleIssue.aggregate([
        {
            $group: {
                _id: '$priority',
                count: { $sum: 1 }
            }
        }
    ]);

    const recentIssues = await VehicleIssue.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
    });

    const resolvedIssues = await VehicleIssue.aggregate([
        {
            $match: {
                status: { $in: ['RESOLVED', 'CLOSED'] },
                resolvedDate: { $exists: true },
                reportedDate: { $exists: true }
            }
        },
        {
            $addFields: {
                resolutionTime: {
                    $divide: [
                        { $subtract: ['$resolvedDate', '$reportedDate'] },
                        1000 * 60 * 60 * 24
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                avgResolutionTime: { $avg: '$resolutionTime' },
                count: { $sum: 1 }
            }
        }
    ]);

    const typeStats = await VehicleIssue.aggregate([
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);

    const avgResolutionTime = resolvedIssues.length > 0
        ? Math.round(resolvedIssues[0].avgResolutionTime * 10) / 10
        : 0;

    res.json({
        success: true,
        data: {
            totalIssues,
            openIssues,
            priority: Object.fromEntries(priorityStats.map(stat => [stat._id, stat.count])),
            recentIssues,
            avgResolutionTime,
            topIssueTypes: typeStats
        }
    });
});

module.exports = {
    getAllIssues,
    getIssueById,
    createIssue,
    updateIssue,
    updateIssueStatus,
    assignIssueToTechnician,
    addIssueNote,
    uploadIssueImages,
    addPartsUsed,
    getIssuesByVehicle,
    getDashboardStats
};