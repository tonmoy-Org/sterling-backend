const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary directly
cloudinary.config({
    cloud_name: "ddh86gfrm",
    api_key: "797395234716915",
    api_secret: "3E_KFio-qRd_llXTlj6bd3w_sK0", 
});

const uploadToCloudinary = (file, folder = 'general') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `sterling-septic/${folder}`,
                resource_type: 'auto',
                transformation: [
                    { quality: 'auto:good' },
                    { fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        streamifier.createReadStream(file.data).pipe(uploadStream);
    });
};

const deleteFromCloudinary = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        throw error;
    }
};

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary
};
