// Goes in front of Tesseract's worker script (plugins/tesseract.ts).
// Tesseract prints notes like "Image too small to scale!!" as console errors;
// they aren't errors for Tuls, so they go to console.debug. Language files
// come from the browser cache the page saved them in, when it did.
;(() => {
  const note = (...parts) => console.debug(...parts)
  console.log = console.info = console.warn = console.error = note
  const CACHE = '__TULS_ENGINE_CACHE__'
  const network = self.fetch.bind(self)
  self.fetch = async (input, init) => {
    try {
      const saved = await (await self.caches.open(CACHE)).match(input)
      if (saved) return saved
    } catch {
      // No Cache Storage here (some private modes): the network it is.
    }
    return network(input, init)
  }
})()
