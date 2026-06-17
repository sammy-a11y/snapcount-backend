const express = require('express')
const cors = require('cors')
const multer = require('multer')
const sharp = require('sharp')
require('dotenv').config()

const app = express()
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'SnapCount AI Backend Running! 🚀' })
})

app.post('/scan', upload.array('photos', 5), async (req, res) => {
  try {
    const itemType = req.body.itemType || 'items'
    const files = req.files

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' })
    }

    // Compress image
    const compressed = await sharp(files[0].buffer)
      .resize({ width: 512, height: 512, fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer()

    console.log('Original:', files[0].buffer.length, 'Compressed:', compressed.length)

    const base64Image = compressed.toString('base64')

    const prompt = `Look at this image carefully. Count every visible ${itemType} you can see.

You MUST respond with ONLY a JSON object. No explanation. No markdown. No extra text. Just raw JSON.
Use this exact structure but fill in YOUR OWN counts based on what you actually see:

{"success":true,"total":ACTUAL_COUNT,"breakdown":[{"photo":1,"count":ACTUAL_COUNT,"notes":"describe what you see"}],"confidence":CONFIDENCE_0_TO_100,"item_type":"${itemType}","suggestions":"any tips for better photo","error":""}`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Image
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512
          }
        })
      }
    )

    const data = await response.json()
    console.log('Gemini response:', JSON.stringify(data))

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!text) {
      throw new Error('Gemini returned empty — ' + JSON.stringify(data))
    }

    const clean = text
      .replace(/```json|```/g, '')
      .replace(/\\_/g, '_')
      .trim()

    let result
    try {
      result = JSON.parse(clean)
    } catch {
      result = {
        success: true,
        total: 0,
        breakdown: [{ photo: 1, count: 0, notes: text }],
        confidence: 70,
        item_type: itemType,
        suggestions: text,
        error: ''
      }
    }

    res.json(result)

  } catch (err) {
    console.error('Backend error:', err.message)
    res.status(500).json({
      success: false,
      error: err.message,
      total: 0,
      breakdown: [],
      confidence: 0,
      suggestions: 'Something went wrong'
    })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`SnapCount Backend running on port ${PORT} 🚀`)
})