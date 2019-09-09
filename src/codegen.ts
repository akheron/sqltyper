import * as path from 'path'
import camelCase = require('camelcase')

import { StatementType } from './types'

export function generateTypeScript(
  fileName: string,
  stmt: StatementType
): string {
  const funcName = fileNameToFuncName(fileName)
  return `\
export async function ${funcName}(): Promise<void> {}
`
}

function fileNameToFuncName(fileName: string) {
  const parsed = path.parse(fileName)
  return camelCase(parsed.name)
}
