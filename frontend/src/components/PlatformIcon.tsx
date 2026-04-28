'use client'

import { Globe } from 'lucide-react'
import {
  FaFacebook, FaInstagram, FaLinkedin,
  FaTiktok, FaYoutube,
} from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'

export const PLATFORM_COLORS: Record<string, string> = {
  facebook:  '#1877F2',
  instagram: '#E1306C',
  linkedin:  '#0A66C2',
  tiktok:    '#010101',
  twitter:   '#1DA1F2',
  youtube:   '#FF0000',
  generic:   '#0c5752',
}

export const PLATFORM_LABELS: Record<string, string> = {
  facebook:  'Facebook',
  instagram: 'Instagram',
  linkedin:  'LinkedIn',
  tiktok:    'TikTok',
  twitter:   'X (Twitter)',
  youtube:   'YouTube',
  generic:   'All Platforms',
}

interface Props {
  platform: string
  size?: number
  color?: string   // override color (e.g. 'currentColor' for monochrome)
}

export default function PlatformIcon({ platform, size = 18, color }: Props) {
  const brandColor = color ?? PLATFORM_COLORS[platform] ?? '#0c5752'
  const props = { size, color: brandColor, style: { flexShrink: 0 } }

  switch (platform?.toLowerCase()) {
    case 'facebook':  return <FaFacebook  {...props} />
    case 'instagram': return <FaInstagram {...props} />
    case 'linkedin':  return <FaLinkedin  {...props} />
    case 'tiktok':    return <FaTiktok    {...props} />
    case 'twitter':   return <FaXTwitter  {...props} />
    case 'youtube':   return <FaYoutube   {...props} />
    default:          return <Globe size={size} color={brandColor} style={{ flexShrink: 0 }} />
  }
}
