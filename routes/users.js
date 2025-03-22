
const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const User = require('../models/User');
const Video = require('../models/Video');
const Subscription = require('../models/Subscription');

const router = express.Router();

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', 
  auth, 
  upload.single('avatar'),
  [
    body('username').optional().trim().isLength({ min: 3, max: 30 }),
    body('description').optional().trim().isLength({ max: 1000 })
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { username, description } = req.body;
      
      // Check if username is taken
      if (username) {
        const existingUser = await User.findOne({ username });
        if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
      }
      
      // Update user profile
      const updates = {};
      
      if (username) updates.username = username;
      if (description) updates.description = description;
      if (req.file) updates.avatar = `/uploads/avatars/${req.file.filename}`;
      
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { new: true }
      ).select('-password');
      
      res.json(user);
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   POST /api/users/:id/subscribe
// @desc    Subscribe to a channel
// @access  Private
router.post('/:id/subscribe', auth, async (req, res) => {
  try {
    // Check if user is trying to subscribe to themselves
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot subscribe to yourself' });
    }
    
    // Check if channel exists
    const channel = await User.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Check if already subscribed
    const existingSubscription = await Subscription.findOne({
      subscriber: req.user._id,
      channel: req.params.id
    });
    
    if (existingSubscription) {
      return res.status(400).json({ message: 'Already subscribed to this channel' });
    }
    
    // Create new subscription
    const subscription = new Subscription({
      subscriber: req.user._id,
      channel: req.params.id
    });
    
    await subscription.save();
    
    // Update channel's subscriber count
    await User.findByIdAndUpdate(req.params.id, {
      $inc: { subscribers: 1 }
    });
    
    // Update user's subscribedTo array
    await User.findByIdAndUpdate(req.user._id, {
      $push: { subscribedTo: req.params.id }
    });
    
    res.json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users/:id/unsubscribe
// @desc    Unsubscribe from a channel
// @access  Private
router.post('/:id/unsubscribe', auth, async (req, res) => {
  try {
    // Check if subscription exists
    const subscription = await Subscription.findOne({
      subscriber: req.user._id,
      channel: req.params.id
    });
    
    if (!subscription) {
      return res.status(400).json({ message: 'Not subscribed to this channel' });
    }
    
    // Delete subscription
    await Subscription.deleteOne({ _id: subscription._id });
    
    // Update channel's subscriber count
    await User.findByIdAndUpdate(req.params.id, {
      $inc: { subscribers: -1 }
    });
    
    // Update user's subscribedTo array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { subscribedTo: req.params.id }
    });
    
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/:id/subscription-status
// @desc    Check if user is subscribed to a channel
// @access  Private
router.get('/:id/subscription-status', auth, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      subscriber: req.user._id,
      channel: req.params.id
    });
    
    res.json({ isSubscribed: !!subscription });
  } catch (error) {
    console.error('Check subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/subscriptions
// @desc    Get list of channels user is subscribed to
// @access  Private
router.get('/subscriptions/list', auth, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({
      subscriber: req.user._id
    }).populate('channel', 'username avatar subscribers');
    
    res.json(subscriptions.map(sub => sub.channel));
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/feed
// @desc    Get videos from subscribed channels
// @access  Private
router.get('/feed/subscriptions', auth, async (req, res) => {
  try {
    // Get subscribed channels
    const subscriptions = await Subscription.find({
      subscriber: req.user._id
    });
    
    const channelIds = subscriptions.map(sub => sub.channel);
    
    // Get videos from subscribed channels
    const videos = await Video.find({
      user: { $in: channelIds }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'username avatar subscribers');
    
    res.json(videos);
  } catch (error) {
    console.error('Get subscription feed error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
