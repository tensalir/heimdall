import type { Metadata } from 'next'
import './wembley.css'

export const metadata: Metadata = {
  title: 'Loop x Pleasing — Wembley OOH',
  description:
    'Private preview of the Loop x Pleasing Wembley OOH creative placement map.',
}

export default function WembleyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="wembley-shell">{children}</div>
}
