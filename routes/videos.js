
const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const Video = require('../models/Video');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Like = require('../models/Like');

const router = express.Router();

// @route   POST /api/videos
// @desc    Upload a new video
// @access  Private
router.post('/', 
  auth, 
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  [
    body('title').trim().not().isEmpty().withMessage('Title is required').isLength({ max: 100 }),
    body('description').trim().isLength({ max: 5000 }),
    body('category').isIn(['entertainment', 'music', 'education', 'sports', 'gaming', 'technology', 'travel', 'comedy', 'news'])
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Check if files were uploaded
      if (!req.files || !req.files.video || !req.files.thumbnail) {
        return res.status(400).json({ message: 'Video and thumbnail are required' });
      }

      const { title, description, category, tags } = req.body;
      const videoPath = `/uploads/videos/${req.files.video[0].filename}`;
      const thumbnailPath = `/uploads/thumbnails/${req.files.thumbnail[0].filename}`;
      
      // Create video document
      const video = new Video({
        title,
        description,
        category: category || 'entertainment',
        user: req.user._id,
        videoUrl: videoPath,
        thumbnailUrl: thumbnailPath,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
      });

      await video.save();

      // Populate user data
      await video.populate('user', 'username avatar subscribers');

      res.status(201).json(video);

    } catch (error) {
      console.error('Video upload error:', error);
      res.status(500).json({ message: 'Server error during video upload' });
    }
  }
);

// @route   GET /api/videos
// @desc    Get all videos (with pagination)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const videos = await Video.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username avatar subscribers');
    
    res.json(videos);
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos/:id
// @desc    Get a single video by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('user', 'username avatar subscribers');
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Increment view count
    video.views += 1;
    await video.save();
    
    res.json(video);
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos/user/:userId
// @desc    Get videos by user ID
// @access  Public
router.get('/user/:userId', async (req, res) => {
  try {
    const videos = await Video.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username avatar subscribers');
    
    res.json(videos);
  } catch (error) {
    console.error('Get user videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos/search
// @desc    Search videos
// @access  Public
router.get('/search', async (req, res) => {
  try {
    const { q, sort } = req.query;
    
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    let sortOption = { score: { $meta: 'textScore' } };
    
    // Apply different sorting if specified
    if (sort === 'date') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'views') {
      sortOption = { views: -1 };
    } else if (sort === 'rating') {
      sortOption = { likes: -1 };
    }
    
    const videos = await Video.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' } }
    )
      .sort(sortOption)
      .limit(50)
      .populate('user', 'username avatar subscribers');
    
    res.json(videos);
  } catch (error) {
    console.error('Search videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos/:id/recommended
// @desc    Get recommended videos based on current video
// @access  Public
router.get('/:id/recommended', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Find videos with same category or tags, excluding current video
    const recommendedVideos = await Video.find({
      _id: { $ne: video._id },
      $or: [
        { category: video.category },
        { tags: { $in: video.tags } }
      ]
    })
      .sort({ views: -1 })
      .limit(15)
      .populate('user', 'username avatar subscribers');
    
    res.json(recommendedVideos);
  } catch (error) {
    console.error('Get recommended videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/videos/:id/like
// @desc    Like a video
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Check if user already liked or disliked the video
    const existingLike = await Like.findOne({
      user: req.user._id,
      video: video._id
    });
    
    // If user already liked the video, remove like
    if (existingLike && existingLike.type === 'like') {
      await Like.deleteOne({ _id: existingLike._id });
      video.likes -= 1;
      await video.save();
      return res.json({ message: 'Like removed', video });
    }
    
    // If user disliked the video, change to like
    if (existingLike && existingLike.type === 'dislike') {
      existingLike.type = 'like';
      await existingLike.save();
      video.likes += 1;
      video.dislikes -= 1;
      await video.save();
      return res.json({ message: 'Changed dislike to like', video });
    }
    
    // Create new like
    const newLike = new Like({
      user: req.user._id,
      video: video._id,
      type: 'like'
    });
    
    await newLike.save();
    
    // Update video like count
    video.likes += 1;
    await video.save();
    
    res.json({ message: 'Video liked', video });
  } catch (error) {
    console.error('Like video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/videos/:id/dislike
// @desc    Dislike a video
// @access  Private
router.post('/:id/dislike', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Check if user already liked or disliked the video
    const existingLike = await Like.findOne({
      user: req.user._id,
      video: video._id
    });
    
    // If user already disliked the video, remove dislike
    if (existingLike && existingLike.type === 'dislike') {
      await Like.deleteOne({ _id: existingLike._id });
      video.dislikes -= 1;
      await video.save();
      return res.json({ message: 'Dislike removed', video });
    }
    
    // If user liked the video, change to dislike
    if (existingLike && existingLike.type === 'like') {
      existingLike.type = 'dislike';
      await existingLike.save();
      video.likes -= 1;
      video.dislikes += 1;
      await video.save();
      return res.json({ message: 'Changed like to dislike', video });
    }
    
    // Create new dislike
    const newDislike = new Like({
      user: req.user._id,
      video: video._id,
      type: 'dislike'
    });
    
    await newDislike.save();
    
    // Update video dislike count
    video.dislikes += 1;
    await video.save();
    
    res.json({ message: 'Video disliked', video });
  } catch (error) {
    console.error('Dislike video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos/:id/like-status
// @desc    Get user's like status for a video
// @access  Private
router.get('/:id/like-status', auth, async (req, res) => {
  try {
    const like = await Like.findOne({
      user: req.user._id,
      video: req.params.id
    });
    
    if (!like) {
      return res.json({ liked: false, disliked: false });
    }
    
    res.json({
      liked: like.type === 'like',
      disliked: like.type === 'dislike'
    });
  } catch (error) {
    console.error('Get like status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos/:id/comments
// @desc    Get comments for a video
// @access  Public
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({
      video: req.params.id,
      isReply: false
    })
      .sort({ createdAt: -1 })
      .populate('user', 'username avatar');
    
    res.json(comments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/videos/:id/comments
// @desc    Add a comment to a video
// @access  Private
router.post('/:id/comments', auth, [
  body('content').trim().not().isEmpty().withMessage('Comment content is required').isLength({ max: 1000 })
], async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    const comment = new Comment({
      content: req.body.content,
      user: req.user._id,
      video: video._id
    });
    
    await comment.save();
    
    // Populate user data
    await comment.populate('user', 'username avatar');
    
    res.status(201).json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/videos/:id
// @desc    Delete a video
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Check if user owns the video
    if (video.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to delete this video' });
    }
    
    // Delete comments
    await Comment.deleteMany({ video: video._id });
    
    // Delete likes
    await Like.deleteMany({ video: video._id });
    
    // Delete video
    await Video.deleteOne({ _id: video._id });
    
    res.json({ message: 'Video removed' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
