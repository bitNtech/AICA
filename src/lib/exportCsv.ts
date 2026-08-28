/** Turns rows into a CSV file and hands it to the browser to save — a real
 * download, not a decorative button. No backend needed: this is pure
 * client-side serialization of whatever's currently on screen. */
export function downloadCsv(filename: string, columns: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const s = String(value)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [columns.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))]
  const csv = lines.join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
