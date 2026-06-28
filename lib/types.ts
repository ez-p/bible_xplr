export interface Keyword {
  word: string
  theme: string
  originalLanguage: string
}

export interface PassageResult {
  passageText: string
  passageHtml: string
  reference: string
  keywords?: Keyword[]
  notice?: string
}
