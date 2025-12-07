// backend/controllers/interiorController.js
// Analyze interior wear using Gemini Vision and return condition + value delta.

const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CONDITION_MAP = {
  good: { scoreDelta: 0, valuePct: 0 },
  moderate: { scoreDelta: -5, valuePct: -0.03 },
  poor: { scoreDelta: -12, valuePct: -0.07 }
};

function detectMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function extractJson(text) {
  if (!text) throw new Error('Empty response');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found');
  }
  return JSON.parse(text.slice(first, last + 1).trim());
}

exports.analyzeInteriorWear = async (req, res) => {
  try {
    const { filename, basePrice } = req.body;
    if (!filename) return res.status(400).json({ message: 'filename is required' });

    const uploadsPath = path.join(__dirname, '..', 'uploads', filename);
    if (!fs.existsSync(uploadsPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GEMINI_API_KEY not configured' });
    }

    const baseVal = Number(basePrice) || 500000;
    const modelName = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    const fileData = fs.readFileSync(uploadsPath, { encoding: 'base64' });
    const mimeType = detectMime(filename);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `Classify the car interior wear level as good, moderate, or poor. Return only JSON:
{"condition":"good|moderate|poor","reasons":["reason1","reason2"]}`;

    const result = await model.generateContent([
      { inlineData: { data: fileData, mimeType } },
      { text: prompt }
    ]);

    const text = result.response.text();
    const parsed = extractJson(text);
    const condition = (parsed.condition || 'moderate').toLowerCase();
    const map = CONDITION_MAP[condition] || CONDITION_MAP.moderate;
    const valueDelta = Math.round(baseVal * map.valuePct);

    return res.json({
      condition,
      scoreDelta: map.scoreDelta,
      valueDelta,
      reasons: parsed.reasons || []
    });
  } catch (error) {
    console.error('[Interior] Analysis failed:', error.message);
    const baseVal = Number(req.body?.basePrice) || 500000;
    const map = CONDITION_MAP.moderate;
    return res.status(500).json({
      condition: 'moderate',
      scoreDelta: map.scoreDelta,
      valueDelta: Math.round(baseVal * map.valuePct),
      reasons: ['Fallback: analysis failed']
    });
  }
};
// backend/controllers/interiorController.js
// Analyze interior wear using Gemini Vision and return condition + value delta.

const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CONDITION_MAP = {
  good: { scoreDelta: 0, valuePct: 0 },
  moderate: { scoreDelta: -5, valuePct: -0.03 },
  poor: { scoreDelta: -12, valuePct: -0.07 }
};

function detectMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function extractJson(text) {
  if (!text) throw new Error('Empty response');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found');
  }
  return JSON.parse(text.slice(first, last + 1).trim());
}

exports.analyzeInteriorWear = async (req, res) => {
  try {
    const { filename, basePrice } = req.body;
    if (!filename) return res.status(400).json({ message: 'filename is required' });

    const uploadsPath = path.join(__dirname, '..', 'uploads', filename);
    if (!fs.existsSync(uploadsPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GEMINI_API_KEY not configured' });
    }

    const baseVal = Number(basePrice) || 500000;
    const modelName = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    const fileData = fs.readFileSync(uploadsPath, { encoding: 'base64' });
    const mimeType = detectMime(filename);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `Classify the car interior wear level as good, moderate, or poor. Return only JSON:
{"condition":"good|moderate|poor","reasons":["reason1","reason2"]}`;

    const result = await model.generateContent([
      { inlineData: { data: fileData, mimeType } },
      { text: prompt }
    ]);

    const text = result.response.text();
    const parsed = extractJson(text);
    const condition = (parsed.condition || 'moderate').toLowerCase();
    const map = CONDITION_MAP[condition] || CONDITION_MAP.moderate;
    const valueDelta = Math.round(baseVal * map.valuePct);

    return res.json({
      condition,
      scoreDelta: map.scoreDelta,
      valueDelta,
      reasons: parsed.reasons || []
    });
  } catch (error) {
    console.error('[Interior] Analysis failed:', error.message);
    const baseVal = Number(req.body?.basePrice) || 500000;
    const map = CONDITION_MAP.moderate;
    return res.status(500).json({
      condition: 'moderate',
      scoreDelta: map.scoreDelta,
      valueDelta: Math.round(baseVal * map.valuePct),
      reasons: ['Fallback: analysis failed']
    });
  }
};
// backend/controllers/interiorController.js
// Analyzes interior wear using Gemini Vision and returns a condition with a value penalty.

const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Map condition to score/value deltas (percent of base price for value)
const CONDITION_MAP = {
  good: { scoreDelta: 0, valuePct: 0 },
  moderate: { scoreDelta: -5, valuePct: -0.03 },
  poor: { scoreDelta: -12, valuePct: -0.07 }
};

function detectMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function extractJson(text) {
  if (!text) throw new Error('Empty response from vision model');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found in model response');
  }
  const candidate = text.slice(first, last + 1).trim();
  return JSON.parse(candidate);
}

exports.analyzeInteriorWear = async (req, res) => {
  try {
    const { filename, basePrice } = req.body;
    if (!filename) {
      return res.status(400).json({ message: 'filename is required' });
    }

    const uploadsPath = path.join(__dirname, '..', 'uploads', filename);
    if (!fs.existsSync(uploadsPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GEMINI_API_KEY not configured' });
    }

    const baseVal = Number(basePrice) || 500000;
    const modelName = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    const fileData = fs.readFileSync(uploadsPath, { encoding: 'base64' });
    const mimeType = detectMime(filename);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
Classify the car interior wear level from this photo as one of: good, moderate, poor.
Rules:
- If seats, dashboard, and trims look clean with minimal wear -> good
- Noticeable stains, scuffs, or small tears -> moderate
- Heavy stains, rips, missing panels, severe wear -> poor
Return ONLY JSON like:
{"condition":"good|moderate|poor","reasons":["reason1","reason2"]}
`;

    const result = await model.generateContent([
      { inlineData: { data: fileData, mimeType } },
      { text: prompt }
    ]);

    const text = result.response.text();
    const parsed = extractJson(text);
    const condition = (parsed.condition || 'moderate').toLowerCase();
    const map = CONDITION_MAP[condition] || CONDITION_MAP.moderate;
    const valueDelta = Math.round(baseVal * map.valuePct);

    return res.json({
      condition,
      scoreDelta: map.scoreDelta,
      valueDelta,
      reasons: parsed.reasons || []
    });
  } catch (error) {
    console.error('[Interior] Analysis failed:', error.message);
    // Fallback to moderate wear
    return res.status(500).json({
      condition: 'moderate',
      scoreDelta: CONDITION_MAP.moderate.scoreDelta,
      valueDelta: Math.round((Number(req.body?.basePrice) || 500000) * CONDITION_MAP.moderate.valuePct),
      reasons: ['Fallback: analysis failed']
    });
  }
};

