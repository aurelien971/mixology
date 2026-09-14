'use client'

import { useParams } from 'next/navigation'
import ProjectPanel from '@/components/projects/ProjectPanel'

// The same panel the board opens as a popup, as a page you can link to.
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <ProjectPanel id={id} />
}
