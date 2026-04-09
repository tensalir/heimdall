'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function QueuePage() {
  const [itemId, setItemId] = useState('')
  const [boardId, setBoardId] = useState('18404406006')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    data?: any
  } | null>(null)

  const handleQueue = async () => {
    if (!itemId) {
      setResult({ success: false, message: 'Item ID is required' })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/jobs/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mondayItemId: itemId, mondayBoardId: boardId }),
      })

      const data = await res.json()

      if (res.ok) {
        setResult({ success: true, message: data.message || 'Job queued successfully', data })
        setItemId('')
      } else {
        setResult({ success: false, message: data.error || 'Failed to queue job' })
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manual Queue</h1>
        <p className="text-muted-foreground">
          Queue a briefing from Monday manually
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Queue Briefing</CardTitle>
          <CardDescription>
            Enter a Monday item ID to queue it for Figma sync
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="boardId" className="text-sm font-medium">
              Board ID
            </label>
            <input
              id="boardId"
              type="text"
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="18404406006"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="itemId" className="text-sm font-medium">
              Item ID
            </label>
            <input
              id="itemId"
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="11201396560"
            />
          </div>

          <Button onClick={handleQueue} disabled={loading} className="w-full">
            {loading ? 'Queueing...' : 'Queue Briefing'}
          </Button>

          {result && (
            <div
              className={`rounded-md border p-4 ${
                result.success
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-red-500/50 bg-red-500/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={result.success ? 'default' : 'destructive'}>
                  {result.success ? 'Success' : 'Error'}
                </Badge>
              </div>
              <p className="text-sm">{result.message}</p>
              {result.data?.job && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <p>Job ID: {result.data.job.id}</p>
                  <p>Experiment: {result.data.job.experimentPageName}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
