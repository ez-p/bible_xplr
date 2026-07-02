"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PassageInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onHelp: () => void
  isLoading: boolean
  error?: string
}

export function PassageInput({ value, onChange, onSubmit, onHelp, isLoading, error }: PassageInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="w-full max-w-2xl"
      suppressHydrationWarning
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. John 3:16 or Romans 8:28-39"
          disabled={isLoading}
          autoComplete="off"
          suppressHydrationWarning
          className="flex-1 h-11 px-4 rounded-lg border border-input bg-white text-foreground text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 transition-shadow"
        />
        <Button type="submit" disabled={isLoading || !value.trim()} className="gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Exploring…" : "Explore"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onHelp}
          className="text-sm text-gold hover:text-olive transition-colors"
        >
          How does this work?
        </button>
      </div>
    </form>
  )
}
