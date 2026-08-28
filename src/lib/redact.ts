/** A simple pattern-based PII/PHI redactor — real, running client-side, not
 * a hardcoded before/after screenshot. It catches the common shapes (name
 * introductions, dates of birth, phone numbers, policy IDs, emails, street
 * addresses); production redaction would layer in a fuller NLP/PII model,
 * this is intentionally the honest, demonstrable slice of it. */
export function redactText(input: string): string {
  let out = input

  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[EMAIL]')
  out = out.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[DOB]')
  out = out.replace(/\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]')
  out = out.replace(/\b\d{3}[-.\s]\d{4}\b/g, '[PHONE]')
  out = out.replace(/\b[A-Z]{2,4}-\d{3,8}(?:-[A-Z0-9])?\b/g, '[POLICY_ID]')
  out = out.replace(
    /\b\d{1,5}\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,2}\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd)\.?\b/g,
    '[ADDRESS]',
  )
  out = out.replace(
    /\b(this is|my name is|I'm|I am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    (_m, lead, name) => `${lead} [NAME]${name.endsWith('.') ? '.' : ''}`,
  )

  return out
}
