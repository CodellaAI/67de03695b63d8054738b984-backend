
const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');
const Like = require('../models/Like');

const router = express.Router();

// @route   GET /api/comments/:id/replies
// @desc    Get replies to a comment
// @access  Public
router.get('/:id/replies', async (req, res) => {
  try {
    const replies = await Comment.find({
      parentComment: req.params.id,
      isReply: true
    })
      .sort({ createdAt: 1 })
      .populate('user', 'username avatar');
    
    res.json(replies);
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/comments/:id/replies
// @desc    Reply to a comment
// @access  Private
router.post('/:id/replies', auth, [
  body('content').trim().not().isEmpty().withMessage('Reply content is required').isLength({ max: 1000 })
], async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const parentComment = await Comment.findById(req.params.id);
    
    if (!parentComment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    const reply = new Comment({
      content: req.body.content,
      user: req.user._id,
      video: parentComment.video,
      isReply: true,
      parentComment: parentComment._id
    });
    
    await reply.save();
    
    // Add reply reference to parent comment
    parentComment.replies.push(reply._id);
    await parentComment.save();
    
    // Populate user data
    await reply.populate('user', 'username avatar');
    
    res.status(201).json(reply);
  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/comments/:id/like
// @desc    Like a comment
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user already liked or disliked the comment
    const existingLike = await Like.findOne({
      user: req.user._id,
      comment: comment._id
    });
    
    // If user already liked the comment, remove like
    if (existingLike && existingLike.type === 'like') {
      await Like.deleteOne({ _id: existingLike._id });
      comment.likes -= 1;
      await comment.save();
      return res.json({ message: 'Like removed', comment });
    }
    
    // If user disliked the comment, change to like
    if (existingLike && existingLike.type === 'dislike') {
      existingLike.type = 'like';
      await existingLike.save();
      comment.likes += 1;
      comment.dislikes -= 1;
      await comment.save();
      return res.json({ message: 'Changed dislike to like', comment });
    }
    
    // Create new like
    const newLike = new Like({
      user: req.user._id,
      comment: comment._id,
      type: 'like'
    });
    
    await newLike.save();
    
    // Update comment like count
    comment.likes += 1;
    await comment.save();
    
    res.json({ message: 'Comment liked', comment });
  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/comments/:id/dislike
// @desc    Dislike a comment
// @access  Private
router.post('/:id/dislike', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user already liked or disliked the comment
    const existingLike = await Like.findOne({
      user: req.user._id,
      comment: comment._id
    });
    
    // If user already disliked the comment, remove dislike
    if (existingLike && existingLike.type === 'dislike') {
      await Like.deleteOne({ _id: existingLike._id });
      comment.dislikes -= 1;
      await comment.save();
      return res.json({ message: 'Dislike removed', comment });
    }
    
    // If user liked the comment, change to dislike
    if (existingLike && existingLike.type === 'like') {
      existingLike.type = 'dislike';
      await existingLike.save();
      comment.likes -= 1;
      comment.dislikes += 1;
      await comment.save();
      return res.json({ message: 'Changed like to dislike', comment });
    }
    
    // Create new dislike
    const newDislike = new Like({
      user: req.user._id,
      comment: comment._id,
      type: 'dislike'
    });
    
    await newDislike.save();
    
    // Update comment dislike count
    comment.dislikes += 1;
    await comment.save();
    
    res.json({ message: 'Comment disliked', comment });
  } catch (error) {
    console.error('Dislike comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/comments/:id
// @desc    Delete a comment
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user owns the comment
    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to delete this comment' });
    }
    
    // If it's a parent comment, delete all replies
    if (!comment.isReply) {
      await Comment.deleteMany({ parentComment: comment._id });
    } else {
      // If it's a reply, remove from parent's replies array
      await Comment.updateOne(
        { _id: comment.parentComment },
        { $pull: { replies: comment._id } }
      );
    }
    
    // Delete likes
    await Like.deleteMany({ comment: comment._id });
    
    // Delete comment
    await Comment.deleteOne({ _id: comment._id });
    
    res.json({ message: 'Comment removed' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
