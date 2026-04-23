import { Geist_Mono } from 'next/font/google'
import './showcase.css'

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={`showcase-scope ${geistMono.variable} fixed inset-0 z-40 overflow-y-auto`}
      style={
        {
          ['--f-mono' as string]:
            `var(--font-geist-mono), ui-monospace, 'SF Mono', Menlo, monospace`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
