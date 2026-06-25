const challengePalette = [
  { bg: 'rgba(79, 124, 255, 0.14)', border: 'rgba(79, 124, 255, 0.35)', text: '#3b5ccc' },
  { bg: 'rgba(139, 92, 246, 0.14)', border: 'rgba(139, 92, 246, 0.35)', text: '#6d28d9' },
  { bg: 'rgba(236, 72, 153, 0.14)', border: 'rgba(236, 72, 153, 0.35)', text: '#be185d' },
  { bg: 'rgba(14, 165, 233, 0.14)', border: 'rgba(14, 165, 233, 0.35)', text: '#0369a1' },
  { bg: 'rgba(168, 85, 247, 0.14)', border: 'rgba(168, 85, 247, 0.35)', text: '#7e22ce' },
  { bg: 'rgba(244, 114, 182, 0.14)', border: 'rgba(244, 114, 182, 0.35)', text: '#db2777' },
  { bg: 'rgba(59, 130, 246, 0.14)', border: 'rgba(59, 130, 246, 0.35)', text: '#1d4ed8' },
  { bg: 'rgba(192, 132, 252, 0.14)', border: 'rgba(192, 132, 252, 0.35)', text: '#9333ea' },
]

export function getChallengeLevelColor(index) {
  if (index < challengePalette.length) {
    return challengePalette[index]
  }

  const hue = (index * 47) % 360

  return {
    bg: `hsla(${hue}, 70%, 55%, 0.14)`,
    border: `hsla(${hue}, 70%, 45%, 0.35)`,
    text: `hsl(${hue}, 65%, 38%)`,
  }
}

export function getChallengeColorMap(challengeLevelsList) {
  return Object.fromEntries(
    challengeLevelsList.map((level, index) => [level.challenge, getChallengeLevelColor(index)]),
  )
}

export function getChallengeLevelHeaderStyle(index) {
  const color = getChallengeLevelColor(index)

  return {
    '--level-accent': color.text,
    '--level-accent-border': color.border,
  }
}

export function getChallengeLevelStyle(index) {
  const color = getChallengeLevelColor(index)

  return {
    '--level-bg': color.bg,
    '--level-border': color.border,
    '--level-text': color.text,
  }
}

export function getChallengeNameStyle(challengeName, challengeColorMap) {
  const color = challengeColorMap[challengeName]
  if (!color) return {}

  return {
    '--level-bg': color.bg,
    '--level-border': color.border,
    '--level-text': color.text,
  }
}
