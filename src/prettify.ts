export async function runPrettier(
  filePath: string,
  tsCode: string
): Promise<string> {
  let format, resolveConfig
  try {
    ;({ format, resolveConfig } = require('prettier'))
  } catch (_err) {
    console.warn(
      'WARNING: prettier is not installed, unable to prettify output'
    )
    return tsCode
  }

  const options = await resolveConfig(filePath)
  return await format(tsCode, { ...options, filepath: filePath })
}
