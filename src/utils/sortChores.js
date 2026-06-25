export function sortChoresByPointsThenFrequency(chores) {
  return [...chores].sort((a, b) => {
    if (a.points !== b.points) {
      return a.points - b.points
    }

    const sortA = a.frequencySort ?? 999
    const sortB = b.frequencySort ?? 999
    if (sortA !== sortB) {
      return sortA - sortB
    }

    return a.choreRowId - b.choreRowId
  })
}
