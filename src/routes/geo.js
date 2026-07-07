const express = require('express');
const { reverseGeocode, autocomplete, getPlaceDetails, nearbyPlaces } = require('../services/google');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/reverse', optionalAuth, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const result = await reverseGeocode(lat, lng);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/autocomplete', optionalAuth, async (req, res, next) => {
  try {
    const { q, lat, lng } = req.query;
    if (!q?.trim()) return res.status(400).json({ error: 'q required' });
    const results = await autocomplete(q.trim(), { lat, lng });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get('/place/:placeId', optionalAuth, async (req, res, next) => {
  try {
    const place = await getPlaceDetails(req.params.placeId);
    res.json(place);
  } catch (err) {
    next(err);
  }
});

router.get('/nearby', optionalAuth, async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const places = await nearbyPlaces(lat, lng, radius || 1000);
    res.json(places);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
