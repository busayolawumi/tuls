/** A file that couldn't be used, and why. */
export type Failed = { name: string; message: string }

/** The files that couldn't be used, each with its reason. */
export function FailedList({ failed }: { failed: Failed[] }) {
  return (
    <div
      role="alert"
      className="mt-4 w-full max-w-xl space-y-1 text-left text-sm text-red-600 dark:text-red-400"
    >
      {failed.map((file, i) => (
        // Two files can share a name.
        <p key={i}>
          <span className="font-medium">{file.name}:</span> {file.message}
        </p>
      ))}
    </div>
  )
}
