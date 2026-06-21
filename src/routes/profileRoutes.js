const express = require('express');
const router = express.Router();
const {
  analyzeProfile,
  getAllProfiles,
  getProfileByUsername,
  deleteProfile,
  compareProfiles
} = require('../controllers/profileController');

router.post('/analyze/:username', analyzeProfile);
router.get('/', getAllProfiles);
router.get('/compare', compareProfiles);
router.get('/:username', getProfileByUsername);
router.delete('/:username', deleteProfile);

module.exports = router;
