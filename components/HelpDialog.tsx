"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-heading">How to use Bible Exegesis Explorer</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close help"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 text-sm text-foreground">

          <section className="space-y-2 rounded-lg bg-gold/10 border border-gold/30 px-4 py-4">
            <h3 className="font-semibold text-olive text-base">What is biblical exegesis?</h3>
            <p className="text-olive">
              <span className="font-medium">Exegesis</span> (from the Greek <span className="italic">ἐξήγησις</span>, "to lead out") is the practice of drawing the meaning <span className="italic">out of</span> a text rather than reading a meaning <span className="italic">into</span> it.
            </p>
            <p className="text-olive">
              The Bible was written in ancient Hebrew (Old Testament) and Greek (New Testament). Many words in those languages carry rich theological weight that is difficult to fully capture in English translation. A single Greek or Hebrew word can encode ideas that take an entire sentence to express in English.
            </p>
            <p className="text-olive">
              Bible Exegesis Explorer surfaces those words for you. It identifies the most theologically significant terms in any passage, shows you the original word behind the translation, and explains what that word meant to its first readers — unlocking a deeper understanding of what the text is saying.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-heading text-base">1. Enter a passage reference</h3>
            <p>
              Type any Bible passage into the search box using standard reference notation, then press
              Enter or click <span className="font-medium text-heading">Explore</span>.
            </p>
            <div className="rounded-lg bg-parchment-card border border-gold-muted/40 px-4 py-3 space-y-1 font-mono text-xs text-muted-foreground">
              <p>John 3:16</p>
              <p>Romans 8:28-39</p>
              <p>Psalm 23</p>
              <p>Genesis 1:1-5</p>
              <p>Hebrews 11</p>
            </div>
            <p>Both single verses and multi-verse ranges are supported. The text is drawn from the <span className="font-medium text-heading">English Standard Version (ESV)</span>.</p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-heading text-base">2. Identify significant words</h3>
            <p>
              After fetching the passage, Bible Explorer identifies <span className="font-medium text-heading">theologically significant words</span> — terms central to the passage's meaning, doctrine, or interpretive depth.
            </p>
            <p>
              Each significant word is marked with an{" "}
              <span className="inline-block rounded px-1 py-0.5 bg-gold/20 border-b-2 border-gold text-olive font-medium text-xs">
                gold highlight
              </span>{" "}
              on its first occurrence in the text.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-heading text-base">3. Click a highlighted word</h3>
            <p>
              Clicking any highlighted word opens a side panel with a brief <span className="font-medium text-heading">summary exposition</span> — the original Hebrew or Greek word, its transliteration, and its core meaning in the context of that verse.
            </p>
            <p className="text-muted-foreground text-xs">
              Words from the Old Testament are explored in <span className="font-medium">Hebrew</span>; New Testament words in <span className="font-medium">Greek</span>.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-heading text-base">4. Read the full exposition</h3>
            <p>
              Use the <span className="font-medium text-heading">Read more</span> button to display a full scholarly exposition covering:
            </p>
            <ul className="space-y-1 pl-4 list-disc text-muted-foreground">
              <li>Etymology and root meaning of the original word</li>
              <li>How the word is used across other key Scripture passages</li>
              <li>Theological significance of the term</li>
              <li>How this original-language knowledge deepens understanding of the specific passage</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-heading text-base">5. Explore further</h3>
            <p>
              Click any other highlighted word to open the side panel again with a new exposition. The full exposition in the main window will be replaced when you click <span className="font-medium text-heading">Read more</span> on the new word.
              Enter a new passage reference at any time to start fresh.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  )
}
