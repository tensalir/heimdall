'use client'

import { Check, ChevronDown, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type MondayBoardOption = {
  id: string
  name: string
  subscribers: Array<{ id: string; name: string }>
  status_columns: Array<{ id: string; title: string; labels: Record<string, string> }>
  people_columns: Array<{ id: string; title: string }>
  default_status_column_id: string | null
  default_people_column_id: string | null
}

type Props = {
  boards: MondayBoardOption[]
  boardsLoading: boolean
  boardId: string | null
  onBoardIdChange: (id: string) => void
  assigneeId: string | null
  onAssigneeIdChange: (id: string | null) => void
  statusKey: string | null
  onStatusKeyChange: (key: string) => void
  onSendClick: () => void
  sendDisabled: boolean
  sent: boolean
}

export function SendToMondayDropdown({
  boards,
  boardsLoading,
  boardId,
  onBoardIdChange,
  assigneeId,
  onAssigneeIdChange,
  statusKey,
  onStatusKeyChange,
  onSendClick,
  sendDisabled,
  sent,
}: Props) {
  const selectedBoard = boards.find((b) => b.id === boardId) ?? null
  const statusCol = selectedBoard?.status_columns?.[0]
  const labelEntries = statusCol ? Object.entries(statusCol.labels) : []

  return (
    <div className="flex items-stretch">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-r-none border-r-0"
        disabled={sendDisabled || sent}
        onClick={onSendClick}
      >
        {sent ? (
          <>
            <Check className="size-3.5 text-emerald-600" />
            Sent
          </>
        ) : (
          <>
            <Send className="size-3.5" />
            Send to Monday
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-l-none px-2"
            disabled={boardsLoading || boards.length === 0}
            aria-label="Monday send options"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[min(24rem,calc(100vh-8rem))] w-80 overflow-y-auto">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Target board
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={boardId ?? ''}
            onValueChange={(v) => {
              if (v) onBoardIdChange(v)
            }}
          >
            {boards.map((b) => (
              <DropdownMenuRadioItem key={b.id} value={b.id} className="text-sm">
                {b.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {selectedBoard ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Creative strategist (optional)
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={assigneeId ?? '__none__'}
                onValueChange={(v) => onAssigneeIdChange(v === '__none__' ? null : v)}
              >
                <DropdownMenuRadioItem value="__none__" className="text-sm">
                  Unassigned
                </DropdownMenuRadioItem>
                {selectedBoard.subscribers.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id} className="text-sm">
                    {s.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              {labelEntries.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Status{statusCol?.title ? ` (${statusCol.title})` : ''}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={statusKey ?? ''}
                    onValueChange={(v) => {
                      if (v) onStatusKeyChange(v)
                    }}
                  >
                    {labelEntries.map(([key, label]) => (
                      <DropdownMenuRadioItem key={key} value={key} className="text-sm">
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
