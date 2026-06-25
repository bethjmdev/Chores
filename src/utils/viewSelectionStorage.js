import { useEffect, useMemo, useRef, useState } from 'react'

const allValue = 'all'

export function loadViewSelection(storageKey) {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved || saved === allValue) return null

    const keys = JSON.parse(saved)
    if (!Array.isArray(keys) || keys.length === 0) return null

    return new Set(keys)
  } catch {
    return null
  }
}

export function saveViewSelection(storageKey, selectedKeys) {
  if (selectedKeys === null) {
    localStorage.setItem(storageKey, allValue)
    return
  }

  localStorage.setItem(storageKey, JSON.stringify([...selectedKeys]))
}

function filterValidViewKeys(savedKeys, validKeys) {
  if (!savedKeys) return null

  const filtered = new Set([...savedKeys].filter((key) => validKeys.has(key)))
  return filtered.size > 0 ? filtered : null
}

export function useViewSelection(storageKey, validKeyList) {
  const [selectedKeys, setSelectedKeys] = useState(null)
  const hasRestored = useRef(false)

  const validKeys = useMemo(() => new Set(validKeyList), [validKeyList])

  useEffect(() => {
    if (validKeyList.length === 0 || hasRestored.current) return

    hasRestored.current = true
    const saved = loadViewSelection(storageKey)
    setSelectedKeys(filterValidViewKeys(saved, validKeys))
  }, [storageKey, validKeyList, validKeys])

  useEffect(() => {
    if (!hasRestored.current) return
    saveViewSelection(storageKey, selectedKeys)
  }, [storageKey, selectedKeys])

  return [selectedKeys, setSelectedKeys]
}
