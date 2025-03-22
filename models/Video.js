
const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    default: '0:00'
  },
  views: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    enum: ['entertainment', 'music', 'education', 'sports', 'gaming', 'technology', 'travel', 'comedy', 'news'],
    default: 'entertainment'
  },
  likes: {
    type: Number,
    default: 0
  },
  dislikes: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Create index for search
VideoSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Video', VideoSchema);
