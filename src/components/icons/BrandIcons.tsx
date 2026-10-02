import type { SVGProps } from "react"

/**
 * GitHub Invertocat Icon (white circular badge with dark silhouette)
 * Matching the official GitHub branding asset provided.
 */
export function GithubIcon({ className = "w-4 h-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="12" fill="#FFFFFF" />
      <path
        fill="#181717"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.2C6.588 2.2 2.2 6.588 2.2 12.001c0 4.331 2.809 8.006 6.705 9.303.49.09.668-.213.668-.473 0-.232-.008-.85-.013-1.669-2.726.593-3.301-1.316-3.301-1.316-.446-1.134-1.088-1.436-1.088-1.436-.889-.607.067-.595.067-.595.983.069 1.5 1.01 1.5 1.01.874 1.498 2.293 1.066 2.851.815.09-.633.343-1.066.623-1.311-2.176-.248-4.464-1.09-4.464-4.85 0-1.071.382-1.947 1.008-2.633-.101-.248-.437-1.246.096-2.596 0 0 .823-.264 2.695 1.005A9.37 9.37 0 0112 6.945c.833.004 1.671.113 2.454.33 1.87-1.269 2.691-1.005 2.691-1.005.535 1.35.199 2.348.098 2.596.628.686 1.007 1.562 1.007 2.633 0 3.769-2.292 4.598-4.474 4.842.352.303.665.901.665 1.816 0 1.31-.012 2.368-.012 2.689 0 .263.176.568.674.472 3.894-1.3 6.7-4.972 6.7-9.303C21.8 6.588 17.412 2.2 12 2.2z"
      />
    </svg>
  )
}

/**
 * Ko-fi Cup Icon (white mug with dark outline and vibrant orange heart)
 * Matching the official Ko-fi cup asset provided.
 */
export function KofiIcon({ className = "w-4 h-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Tazza con manico: corpo bianco e contorno spesso */}
      <path
        d="M3.2 2.5C2.1 2.5 1.2 3.4 1.2 4.5v6.2c0 4.2 3.4 7.6 7.6 7.6h4.5c4.2 0 7.6-3.4 7.6-7.6V4.5c0-1.1-.9-2-2-2H3.2z"
        fill="#FFFFFF"
      />
      {/* Contorno scuro della tazza e manico */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.5 1.2h15.2c1.8 0 3.3 1.5 3.3 3.3v1.1c1.8.4 3.2 2 3.2 3.9 0 2.2-1.8 4-4 4h-.7c-.9 3.4-4 5.9-7.7 5.9H8.8C4.5 19.4 1 15.9 1 11.6V4.5C1 2.7 2.1 1.2 3.5 1.2zm15.4 6.7v2.8c1.1-.2 1.9-1.2 1.9-2.3 0-1.2-.8-2.2-1.9-2.4v1.9zm-2.2 2.8V3.4H3.5C2.9 3.4 2.4 3.9 2.4 4.5v7.1c0 3.5 2.9 6.4 6.4 6.4h4c3.3 0 6-2.5 6.3-5.7v-2.3z"
        fill="#232223"
      />
      {/* Cuore arancione Ko-fi */}
      <path
        d="M10.7 5.2c-1.3-.9-2.6.4-2.6.4s-1.3-1.3-2.6-.4c-1.4.9-1.2 2.5-.3 3.4 1.2 1.3 2.9 2.9 2.9 2.9s1.7-1.6 2.9-2.9c.9-.9 1.1-2.5-.3-3.4z"
        fill="#FF5E5B"
      />
    </svg>
  )
}

/**
 * Discord Clyde Icon (official brand blurple circle with white silhouette)
 */
export function DiscordIcon({ className = "w-4 h-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="12" fill="#5865F2" />
      <path
        fill="#FFFFFF"
        d="M17.472 7.747a14.28 14.28 0 0 0-3.52-1.09.06.06 0 0 0-.063.029c-.152.27-.32.624-.438.902a13.195 13.195 0 0 0-3.898 0c-.12-.278-.291-.632-.445-.902a.06.06 0 0 0-.063-.03 14.24 14.24 0 0 0-3.52 1.09.055.055 0 0 0-.025.022C3.25 11.11 2.637 14.377 2.94 17.6a.064.064 0 0 0 .025.045 14.36 14.36 0 0 0 4.316 2.182.062.062 0 0 0 .068-.022c.333-.455.63-.933.884-1.437.018-.035.001-.077-.035-.091a9.444 9.444 0 0 1-1.348-.642.062.062 0 0 1-.006-.103c.09-.067.18-.137.266-.208a.06.06 0 0 1 .063-.008 10.155 10.155 0 0 0 8.687 0 .06.06 0 0 1 .064.008c.086.071.176.141.266.208a.062.062 0 0 1-.005.103 9.4 9.4 0 0 1-1.349.643.062.062 0 0 0-.034.09c.256.505.553.983.883 1.438a.06.06 0 0 0 .068.022 14.335 14.335 0 0 0 4.322-2.182.06.06 0 0 0 .024-.044c.394-3.957-.655-7.195-2.585-9.83a.053.053 0 0 0-.025-.022zM8.52 14.843c-.833 0-1.52-.764-1.52-1.704 0-.94.673-1.704 1.52-1.704.853 0 1.534.77 1.52 1.704 0 .94-.673 1.704-1.52 1.704zm6.96 0c-.833 0-1.52-.764-1.52-1.704 0-.94.673-1.704 1.52-1.704.853 0 1.534.77 1.52 1.704 0 .94-.667 1.704-1.52 1.704z"
      />
    </svg>
  )
}

