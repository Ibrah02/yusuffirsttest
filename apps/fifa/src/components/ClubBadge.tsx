import { clubBadge } from '../lib/branding'

type Props = {
  club: string
  /** Show the club name next to the badge. */
  withName?: boolean
}

/** A generated monogram badge for a club (original artwork, not the real crest). */
export function ClubBadge({ club, withName = true }: Props) {
  const b = clubBadge(club)
  return (
    <span className="club-cell">
      <span
        className="club-badge"
        style={{ background: b.bg, color: b.fg, boxShadow: `0 0 0 2px ${b.ring} inset` }}
        aria-hidden="true"
      >
        {b.abbr}
      </span>
      {withName && <span className="club-name">{club}</span>}
    </span>
  )
}
