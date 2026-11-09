import Image from 'next/image'

export function HimarkWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`relative mx-auto block overflow-hidden ${compact ? 'h-5 w-28' : 'h-6 w-32'}`}>
      <Image
        src="/brand/himark-wordmark.png"
        width={2163}
        height={727}
        sizes={compact ? '144px' : '160px'}
        loading="eager"
        alt="HIMARK"
        className={`absolute top-1/2 left-1/2 h-auto max-w-none -translate-x-1/2 -translate-y-1/2 ${compact ? 'w-36' : 'w-40'}`}
      />
    </span>
  )
}
