
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create upload directories if they don't exist
const createDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

createDir(path.join(__dirname, '../uploads/videos'));
createDir(path.join(__dirname, '../uploads/thumbnails'));
createDir(path.join(__dirname, '../uploads/avatars'));

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = '';
    
    if (file.fieldname === 'video') {
      uploadPath = path.join(__dirname, '../uploads/videos');
    } else if (file.fieldname === 'thumbnail') {
      uploadPath = path.join(__dirname, '../uploads/thumbnails');
    } else if (file.fieldname === 'avatar') {
      uploadPath = path.join(__dirname, '../uploads/avatars');
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    // Accept video files
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  } else if (file.fieldname === 'thumbnail' || file.fieldname === 'avatar') {
    // Accept image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  } else {
    cb(new Error('Unexpected field'), false);
  }
};

// Upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 100 // 100MB limit
  }
});

module.exports = upload;
