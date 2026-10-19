// What Unlock PDF says about the PDFs a password didn't open.

/** For a PDF that opens without a password: there's nothing to take off. */
export const NO_PASSWORD = 'It doesn’t have a password.'

/** After trying a password: how many of the locked PDFs it didn't open. */
export function wrongPassword(wrong: number, tried: number) {
  if (tried === 1)
    return 'That password didn’t open it. Check it and try again.'
  if (wrong === tried) {
    return 'That password didn’t open them. Check it and try again.'
  }
  return wrong === 1
    ? `That password didn’t open 1 of the ${tried} PDFs. Type its password and try again.`
    : `That password didn’t open ${wrong} of the ${tried} PDFs. Type theirs and try again.`
}
