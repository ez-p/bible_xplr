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
          placeholder="John 3:16 or Romans 8:28-39"
          disabled={isLoading}
          autoComplete="off"
          suppressHydrationWarning
          className="flex-1 h-11 px-4 rounded-lg border border-stone-300 bg-white text-stone-900 text-base placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 transition-shadow"
        />
        <Button type="submit" disabled={isLoading || !value.trim()} className="gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Exploring…" : "Explore"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onHelp}
          className="text-sm text-amber-500 hover:text-amber-600 transition-colors"
        >
          How does this work?
        </button>
      </div>
    </form>
  )
}
