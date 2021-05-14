/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {

    /**
     * 编译函数，主要做了：
     *   合并 finalOptions（即baseOptions）和 options，得到一份最终的编译配置
     *   调用 baseCompile 得到编译结果（真正编译的核心是在 baseCompile 中）
     * @param {*} template 模板 template 字符串
     * @param {*} options 编译配置
     * @returns 
     */
    function compile (template: string, options?: CompilerOptions): CompiledResult {
      // 基于 baseOptions 创建 finalOptions
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      // 如果有 options，那么 options 与 finalOptions 合并
      if (options) {
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }

        // merge custom modules
        // 合并自定义模块
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }

        // merge custom directives
        // 合并自定义指令
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }

        // copy other options
        // options 的其他配置拷贝 finalOptions
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      // 执行 baseCompile，真正执行编译三步 parse、optimize、generate
      const compiled = baseCompile(template.trim(), finalOptions)

      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }

      // 将编译期间的 error 和 tip，挂载到编译结果上
      compiled.errors = errors
      compiled.tips = tips

      // 将编译结果返回
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
