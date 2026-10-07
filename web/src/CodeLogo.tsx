interface CodeLogoProps {
  size?:      number
  className?: string
  title?:     string
}

/** Code logo (designer artwork, raster). Served by the host from
 *  `/code-logo.png`; rendered as a square image so it weighs the same as its
 *  neighbours in the waffle menu. */
export function CodeLogo({ size = 24, className, title = 'Code' }: CodeLogoProps) {
  return (
    <img
      src="/code-logo.png"
      width={size}
      height={size}
      alt={title}
      className={className}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}

export default CodeLogo
