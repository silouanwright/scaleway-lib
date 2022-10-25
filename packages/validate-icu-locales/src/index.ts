#!/usr/bin/env node

import { parse } from '@formatjs/icu-messageformat-parser'
import { ParserError } from '@formatjs/icu-messageformat-parser/error'
import { readFile } from 'fs/promises'
import { globby } from 'globby'
import { importFromString } from 'module-from-string'

const args = process.argv.slice(2)
const pattern = args[0]
const { error, table } = console

type Locales = Record<string, string>
type ErrorICU = {
  message: ParserError['message']
  value: string
  key: string
  filePath: string
}

type ErrorsICU = (ErrorICU | undefined)[]

const isObject = (obj: unknown): obj is Record<string, unknown> =>
  obj === Object(obj)

const findICUErrors = (
  locales: { [key: string]: string },
  filePath: string,
): ErrorsICU => {
  const keys = Object.keys(locales)

  const errors = keys
    .map(key => {
      const value = locales[key]

      try {
        parse(value)

        return undefined
      } catch (err) {
        const { message } = err as ParserError

        return {
          message,
          value,
          key,
          filePath,
        }
      }
    })
    .filter(Boolean)

  return errors
}

const readFiles = async (files: string[]): Promise<ErrorsICU> => {
  const errors = []

  for await (const file of files) {
    const extension = file.split('.').pop()

    if (extension === 'json') {
      try {
        const data = await readFile(file)
        const jsonFile = data.toString()

        const locales = JSON.parse(jsonFile) as Locales

        const ICUErrors = findICUErrors(locales, file)
        errors.push(...ICUErrors)
      } catch (err) {
        error({ file, err })
      }
    }

    if (extension === 'ts' || extension === 'js') {
      try {
        const data = await readFile(file)
        const javascriptFile = data.toString()

        const mod: unknown = await importFromString(javascriptFile, {
          transformOptions: { loader: 'ts' },
        })

        if (isObject(mod)) {
          if ('default' in mod) {
            const { default: locales } = mod as { default: Locales }

            const ICUErrors = findICUErrors(locales, file)
            errors.push(...ICUErrors)
          } else {
            error('export default from: ', file, ' is not an object')
          }
        } else {
          error(file, ' is not an object')
        }
      } catch (err) {
        error({ err, file })
      }
    }
  }

  return errors
}

const files = await globby(pattern)

if (files.length === 0) {
  error('There is no files matching this pattern', pattern)
  process.exit(1)
}

table(files)

const errors = await readFiles(files)

if (errors.length > 0) {
  error({
    errors,
  })
  process.exit(1)
}
