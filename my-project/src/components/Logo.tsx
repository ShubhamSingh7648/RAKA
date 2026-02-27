type LogoSize = 'sm' | 'md' | 'lg'

type LogoProps = {
  size?: LogoSize
}

const sizeClasses: Record<LogoSize, { text: string; icon: string }> = {
  sm: {
    text: 'text-sm',
    icon: 'h-4 w-4',
  },
  md: {
    text: 'text-base',
    icon: 'h-5 w-5',
  },
  lg: {
    text: 'text-xl',
    icon: 'h-6 w-6',
  },
}

export default function Logo({ size = 'md' }: LogoProps) {
  const classes = sizeClasses[size]

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={classes.icon}
      >
        <circle cx="9" cy="12" r="6" fill="rgba(124,58,237,0.9)" />
        <circle cx="15" cy="12" r="6" fill="rgba(16,185,129,0.85)" />
      </svg>
      <span
        className={[
          classes.text,
          'font-mono font-semibold tracking-tight text-slate-100',
        ].join(' ')}
      >
        Connecta
      </span>
    </div>
  )
}
