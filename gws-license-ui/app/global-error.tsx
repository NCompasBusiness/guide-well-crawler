'use client'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h2>Application error</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#991b1b' }}>
          {error.message}
        </pre>
        {error.digest && <p style={{ color: '#7f1d1d' }}>digest: {error.digest}</p>}
      </body>
    </html>
  )
}
