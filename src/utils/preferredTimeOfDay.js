export function getPreferredTimeOfDayLabel(preferredTimeOfDayRowId, timeOfDayList) {
  if (preferredTimeOfDayRowId == null || preferredTimeOfDayRowId === '') {
    return null
  }

  const rowId = Number(preferredTimeOfDayRowId)
  const match = timeOfDayList.find((item) => item.rowId === rowId)

  return match?.label ?? null
}

export function getPreferredTimeOfDayIcon(preferredTimeOfDayRowId, timeOfDayList) {
  if (preferredTimeOfDayRowId == null || preferredTimeOfDayRowId === '') {
    return null
  }

  const rowId = Number(preferredTimeOfDayRowId)
  const match = timeOfDayList.find((item) => item.rowId === rowId)

  return match?.icon ?? null
}

export function parsePreferredTimeOfDayRowId(value) {
  if (value == null || value === '') {
    return null
  }

  return Number(value)
}

export const noTimeOfDaySort = 9999

export function getTimeOfDaySort(preferredTimeOfDayRowId, timeOfDayList) {
  if (preferredTimeOfDayRowId == null || preferredTimeOfDayRowId === '') {
    return noTimeOfDaySort
  }

  const rowId = Number(preferredTimeOfDayRowId)
  const match = timeOfDayList.find((item) => item.rowId === rowId)

  return match?.sort ?? noTimeOfDaySort
}
