'use client'

import dynamic from 'next/dynamic'

const CityMap = dynamic(() => import('@/components/CityMap'), { ssr: false })

export default function Home() {
  return <CityMap />
}