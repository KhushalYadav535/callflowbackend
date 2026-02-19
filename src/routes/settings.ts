import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { Company } from '../models/Company'

const router = Router()

// GET /api/settings
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const company = await Company.findById(companyId).select(
      'name email companyType vapiApiKey vapiPhoneNumberId n8nWebhookUrl backendBaseUrl'
    )
    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }
    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load settings' })
  }
})

// PUT /api/settings/backend-url
router.put('/backend-url', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { backendBaseUrl } = req.body as { backendBaseUrl?: string }

    if (!backendBaseUrl || typeof backendBaseUrl !== 'string') {
      return res.status(400).json({ message: 'backendBaseUrl is required' })
    }

    const url = backendBaseUrl.replace(/\/$/, '')
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { backendBaseUrl: url } },
      { new: true, select: 'name email companyType n8nWebhookUrl backendBaseUrl' }
    )

    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }

    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update settings' })
  }
})

// PUT /api/settings/n8n-webhook (for launch - where we push contacts)
router.put('/n8n-webhook', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { n8nWebhookUrl } = req.body as { n8nWebhookUrl?: string }

    if (!n8nWebhookUrl || typeof n8nWebhookUrl !== 'string') {
      return res.status(400).json({ message: 'n8nWebhookUrl is required' })
    }

    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { n8nWebhookUrl } },
      { new: true, select: 'name email companyType n8nWebhookUrl backendBaseUrl' }
    )

    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }

    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update settings' })
  }
})

export default router

