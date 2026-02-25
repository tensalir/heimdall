/**
 * Sprint sheet layout — full-screen standalone module (no sidebar).
 * Route group (sheet) keeps URL as /briefing-assistant/[sprintId].
 */
export default function BriefingSheetLayout({
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
