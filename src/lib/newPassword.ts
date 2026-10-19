import { appleTrouble, isShort, isTooLong, listed } from './password'

// What the password tools say about a new password: hints while typing,
// and why it can't be used yet when it's submitted (NewPasswordForm).

export const TOO_LONG =
  'That password is too long for a PDF. Use a shorter one.'

/** The hints under the boxes, as typed. */
export function passwordHints(password: string) {
  const hints: { text: string; warning: boolean }[] = []
  if (isTooLong(password)) hints.push({ text: TOO_LONG, warning: true })
  const trouble = appleTrouble(password)
  if (trouble.length > 0) {
    hints.push({
      text: `iPhones and Macs won’t open the PDF with this password, because of ${listed(trouble)}. If anyone will open it on an Apple device, use other characters.`,
      warning: true,
    })
  }
  if (isShort(password)) {
    hints.push({
      text: 'Short passwords are easy to guess. 8 characters or more is safer.',
      warning: false,
    })
  }
  return hints
}

/**
 * Why the passwords can't be used, and which box to fix, or undefined if
 * they can. Apple trouble and short passwords are only hints.
 */
export function passwordProblem(
  password: string,
  again: string,
): { message: string; box: 'password' | 'again' } | undefined {
  if (password === '') return { message: 'Type a password.', box: 'password' }
  if (isTooLong(password)) return { message: TOO_LONG, box: 'password' }
  if (again === '') return { message: 'Type the password again.', box: 'again' }
  if (again.normalize('NFC') !== password.normalize('NFC')) {
    return { message: 'The two passwords don’t match.', box: 'again' }
  }
}
