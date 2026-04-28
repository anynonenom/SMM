export type Platform = 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'tiktok' | 'youtube' | 'generic'

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []

  const header = parseCSVLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    header.forEach((key, idx) => {
      row[key.trim()] = (values[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function detectPlatform(rows: Record<string, string>[]): Platform {
  if (!rows.length) return 'generic'
  const keys = Object.keys(rows[0]).map(k => k.toLowerCase().replace(/[\s_\-]/g, ''))
  const joined = keys.join(' ')

  if (joined.includes('instagram') || keys.some(k => ['saves', 'reel', 'carousel', 'storiesreach'].includes(k))) return 'instagram'
  if (joined.includes('linkedin') || keys.some(k => ['uniqueimpressions', 'engagementrateclick', 'ctr'].includes(k))) return 'linkedin'
  if (joined.includes('tiktok') || keys.some(k => ['videowatchtime', 'averagewatchtime', 'videoduration'].includes(k))) return 'tiktok'
  if (joined.includes('youtube') || keys.some(k => ['watchtime', 'subscribersgained', 'avgviewduration'].includes(k))) return 'youtube'
  if (joined.includes('twitter') || keys.some(k => ['retweets', 'quotetweets', 'urlclicks'].includes(k))) return 'twitter'
  if (joined.includes('facebook') || keys.some(k => ['pagelikes', 'postclicks', 'pagereaches'].includes(k))) return 'facebook'

  return 'generic'
}
