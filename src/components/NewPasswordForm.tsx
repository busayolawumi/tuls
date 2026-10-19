import { useId, useRef, useState, type FormEvent } from 'react'
import { passwordHints, passwordProblem } from '../lib/newPassword'
import { PasswordInput, ShowPassword } from './PasswordInput'

// Choosing a password for PDFs: typed twice, with "Show passwords", hints as
// it's typed (short, or what iPhones and Macs can't take), and its problems
// when it's submitted. Used by Protect PDF, and by Unlock PDF to give
// unlocked PDFs a new password. The password lives only here, so it's gone
// when the form is.

type Props = {
  /** How many PDFs it's for, for the button's words. */
  count: number
  /** What went wrong after it was submitted, if anything. */
  error?: string
  onSubmit: (password: string) => void
}

export function NewPasswordForm({ count, error, onSubmit }: Props) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [shown, setShown] = useState(false)
  const [problem, setProblem] = useState<ReturnType<typeof passwordProblem>>()
  const passwordBox = useRef<HTMLInputElement>(null)
  const againBox = useRef<HTMLInputElement>(null)
  const hintsId = useId()
  const problemId = useId()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = passwordProblem(password, again)
    setProblem(found)
    if (found) {
      ;(found.box === 'password' ? passwordBox : againBox).current?.focus()
      return
    }
    onSubmit(password)
  }

  const hints = passwordHints(password)
  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="mt-4">
        <PasswordInput
          ref={passwordBox}
          label="Password"
          value={password}
          onChange={(value) => {
            setPassword(value)
            setProblem(undefined)
          }}
          shown={shown}
          describedBy={
            problem?.box === 'password' ? `${problemId} ${hintsId}` : hintsId
          }
          invalid={problem?.box === 'password'}
        />
        <PasswordInput
          ref={againBox}
          label="Type it again"
          value={again}
          onChange={(value) => {
            setAgain(value)
            setProblem(undefined)
          }}
          shown={shown}
          describedBy={problem?.box === 'again' ? problemId : undefined}
          invalid={problem?.box === 'again'}
        />
        <ShowPassword shown={shown} onChange={setShown} plural />
        <div id={hintsId} aria-live="polite" className="mt-3 space-y-1">
          {hints.map((hint) => (
            <p
              key={hint.text}
              className={`text-xs ${
                hint.warning
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {hint.text}
            </p>
          ))}
        </div>
        {problem && (
          <p
            id={problemId}
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {problem.message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {count > 1 ? `Add password to ${count} PDFs` : 'Add password'}
        </button>
      </form>
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Anyone with the password can open, print, copy and change{' '}
        {count > 1 ? 'them' : 'it'}.
      </p>
    </>
  )
}
