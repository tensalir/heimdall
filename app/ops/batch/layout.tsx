/**
 * Batch Kanban layout — full-screen, no sidebar.
 * Similar to the sheets layout pattern for focused views.
 */
export default function BatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen overflow-hidden bg-background">
      {children}
    </div>
  )
}
