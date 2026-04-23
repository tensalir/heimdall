import { ShowcaseTopBar } from '@/components/showcase/ShowcaseTopBar'
import { FoundationsHero } from '@/components/showcase/FoundationsHero'
import { SoftwareForFew } from '@/components/showcase/SoftwareForFew'
import { ProjectsShowcase } from '@/components/showcase/ProjectsShowcase'
import { ShowcaseFooter } from '@/components/showcase/ShowcaseFooter'
import { PROJECTS } from '@/lib/showcase/projects'

export const metadata = {
  title: 'AI in Studio — Creative Technology at Loop',
  description:
    'Foundations, positioning, and four tools built by Creative Technology at Loop Earplugs.',
}

export default function ShowcasePage() {
  return (
    <>
      <ShowcaseTopBar />
      <main>
        <FoundationsHero />
        <SoftwareForFew />
        <ProjectsShowcase projects={PROJECTS} />
      </main>
      <ShowcaseFooter />
    </>
  )
}
