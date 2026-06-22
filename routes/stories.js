const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { uploadPost } = require('../lib/cloudinary');
const Story = require('../models/Story');
const User = require('../models/User');

// Uploader une story
router.post('/api/stories/upload', requireAuth, uploadPost.single('media'), async (req, res) => {
    try {
        const story = await Story.create({
            auteur: req.session.user.id,
            media: req.file.path,
            type: req.file.mimetype.startsWith('video') ? 'video' : 'image'
        });
        res.json({ success: true, story });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Récupérer les stories des amis + la sienne
router.get('/api/stories', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).populate('amis');
        const amisIds = user.amis.map(a => a._id);
        amisIds.push(req.session.user.id);

        const stories = await Story.find({
            auteur: { $in: amisIds },
            expireAt: { $gt: new Date() }
        }).populate('auteur', 'nom photoProfil').sort({ createdAt: -1 });

        res.json({ stories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Marquer une story comme vue
router.post('/api/stories/:id/view', requireAuth, async (req, res) => {
    try {
        const story = await Story.findById(req.params.id);
        if (story && !story.vues.includes(req.session.user.id)) {
            story.vues.push(req.session.user.id);
            await story.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
