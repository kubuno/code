interface CodeLogoProps {
  size?:      number
  className?: string
  title?:     string
}

/** Logo Code : carré arrondi sombre + curseur d'insertion cyan entre des caractères. */
export function CodeLogo({ size = 24, className, title = 'Code' }: CodeLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <rect width="512" height="512" rx="114" fill="#0F172A" />
      <rect x="171" y="218" width="34" height="76" rx="3" fill="#475569" />
      <rect x="215" y="218" width="34" height="76" rx="3" fill="#475569" />
      <rect x="307" y="218" width="34" height="76" rx="3" fill="#475569" />
      <path d="M271 168 L271 344 M247 168 L295 168 M247 344 L295 344" stroke="#38BDF8" strokeWidth="16" strokeLinecap="round" />
    </svg>
  )
}

export default CodeLogo
