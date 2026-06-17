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

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const token = process.env.CLOUDFLARE_TOKEN

    const prompt = `Look at this image carefully. Count every visible ${itemType} you can see.

You MUST respond with ONLY a JSON object. No explanation. No markdown. No extra text. Just raw JSON.
Use this exact structure but fill in YOUR OWN counts based on what you actually see:

{"success":true,"total":ACTUAL_COUNT,"breakdown":[{"photo":1,"count":ACTUAL_COUNT,"notes":"describe what you see"}],"confidence":CONFIDENCE_0_TO_100,"item_type":"${itemType}","suggestions":"any tips for better photo","error":""}`

    // Compress aggressively
    const compressed = await sharp(files[0].buffer)
      .resize({ width: 200, height: 200, fit: 'inside' })
      .jpeg({ quality: 40 })
      .toBuffer()

    console.log('Original:', files[0].buffer.length, 'Compressed:', compressed.length)

    // Send as array of integers
    const imageArray = [...new Uint8Array(compressed)]

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: imageArray,
          prompt: prompt,
          max_tokens: 256
        })
      }
    )

    const data = await response.json()
    console.log('Cloudflare response:', JSON.stringify(data))

    const text = data?.result?.description || ''

    if (!text) {
      throw new Error('AI returned empty — ' + JSON.stringify(data))
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