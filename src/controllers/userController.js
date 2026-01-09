const User = require('../models/User');
const { validationResult } = require('express-validator');

const getAllUsers = async (req, res) => {
    try {
        const { search, role, status, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const filter = {};

        if (req.query.excludeCurrent === 'true') {
            filter._id = { $ne: req.user._id };
        }

        if (role && role !== 'all') {
            filter.role = role;
        }

        if (status && status !== 'all') {
            if (status === 'active') filter.isActive = true;
            if (status === 'inactive') filter.isActive = false;
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { role: { $regex: search, $options: 'i' } }
            ];
        }

        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password -resetPasswordToken -resetPasswordExpire')
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            totalPages: Math.ceil(total / limitNum),
            currentPage: parseInt(page),
            data: users,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching users',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};


const getTechRoleUsers = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const filter = { role: 'tech' }; // Only this line is different from getAllUsers

        if (req.query.excludeCurrent === 'true') {
            filter._id = { $ne: req.user._id };
        }

        if (status && status !== 'all') {
            if (status === 'active') filter.isActive = true;
            if (status === 'inactive') filter.isActive = false;
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { role: { $regex: search, $options: 'i' } }
            ];
        }

        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password -resetPasswordToken -resetPasswordExpire')
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            totalPages: Math.ceil(total / limitNum),
            currentPage: parseInt(page),
            data: users,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching tech users',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -resetPasswordToken -resetPasswordExpire');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, data: user });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const createUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { name, email, password, role, isActive } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User with this email already exists' });
        }

        if (role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only superadmin can create superadmin users' });
        }

        const user = new User({
            name,
            email,
            password,
            role: role || 'manager',
            isActive: isActive !== undefined ? isActive : true,
        });

        await user.save();

        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.resetPasswordToken;
        delete userResponse.resetPasswordExpire;

        res.status(201).json({ success: true, message: 'User created successfully', data: userResponse });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const updateUser = async (req, res) => {
    try {
        const { name, email, role, password, isActive } = req.body;

        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only superadmin can modify superadmin users' });
        }

        if (role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only superadmin can assign superadmin role' });
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (typeof isActive !== 'undefined') updateData.isActive = isActive;
        if (password && password.trim() !== '') updateData.password = password;

        user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
            .select('-password -resetPasswordToken -resetPasswordExpire');

        res.status(200).json({ success: true, message: 'User updated successfully', data: user });

    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Cannot delete superadmin user' });
        }

        if (user._id.toString() === req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'User deleted successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Cannot deactivate superadmin user' });
        }

        if (user._id === req.user._id) {
            return res.status(403).json({ success: false, message: 'Cannot deactivate your own account' });
        }

        user.isActive = !user.isActive;
        await user.save();

        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.resetPasswordToken;
        delete userResponse.resetPasswordExpire;

        res.status(200).json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, data: userResponse });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling user status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const bulkUpdateStatus = async (req, res) => {
    try {
        const { userIds, isActive } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Please provide user IDs' });
        }

        const users = await User.find({ _id: { $in: userIds } });
        if (users.some(u => u.role === 'superadmin')) {
            return res.status(403).json({ success: false, message: 'Cannot modify superadmin users' });
        }

        const selfUser = users.find(u => u._id.toString() === req.user._id.toString());
        if (selfUser && isActive === false) {
            return res.status(403).json({ success: false, message: 'Cannot deactivate your own account' });
        }

        await User.updateMany({ _id: { $in: userIds } }, { isActive });
        res.status(200).json({ success: true, message: `${userIds.length} user(s) ${isActive ? 'activated' : 'deactivated'} successfully` });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while bulk updating user status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

const checkEmailExists = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        res.status(200).json({
            success: true,
            exists: !!user,
            data: user ? { id: user._id, name: user.name, email: user.email, role: user.role } : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while checking email',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
    bulkUpdateStatus,
    bulkUpdateStatus,
    checkEmailExists,
    getTechRoleUsers
};
